import { describe, expect, it } from 'bun:test';
import { anonymous, policyOf, user } from './evaluation.fixtures';
import { type Decision, isLimixRefusal } from './refusal';
import { evaluateRest } from './rest';

const refusalOf = (decision: Decision) => {
	if (decision.allow) throw new Error('expected a refusal');
	return decision.refusal;
};

const policy = policyOf(
	{
		global: { unmatched: 'deny' },
		rest: {
			'/health': { GET: { public: true } },
			'/me': { GET: { authenticated: true } },
			'/documents/:id': {
				GET: { roles: [['admin'], ['editor', 'reviewer']] },
				PUT: { permissions: [['docs:write'], ['docs:admin', 'audit:read']] },
				DELETE: { when: ['working', 'sane'] },
			},
		},
	},
	{
		working: () => true,
		sane: ({ request }) =>
			(request as { params: { id: string } }).params.id !== 'bad',
	},
);

const get = (path: string, claims = user(), extra = {}) =>
	evaluateRest(policy, { method: 'GET', path, claims, ...extra });

describe('the 401, 403 ladder on REST', () => {
	it('answers 401 to an anonymous caller on a rule that is not public', async () => {
		const refusal = refusalOf(await get('/me', anonymous));
		expect(refusal.code).toBe('auth.errors.unauthenticated');
		expect(refusal.status).toBe(401);
		expect(isLimixRefusal(refusal)).toBe(true);
	});

	it('lets an anonymous caller reach a public rule', async () => {
		expect((await get('/health', anonymous)).allow).toBe(true);
	});

	it('checks sign-in before roles', async () => {
		expect(refusalOf(await get('/documents/1', anonymous)).status).toBe(401);
	});

	it('answers 403 when the roles do not hold', async () => {
		const refusal = refusalOf(await get('/documents/1'));
		expect(refusal.code).toBe('auth.errors.forbidden');
		expect(refusal.status).toBe(403);
	});

	it('lets a caller who is signed in reach an authenticated rule', async () => {
		expect((await get('/me')).allow).toBe(true);
	});
});

describe('unmatched', () => {
	it('answers 401 to an anonymous caller and 403 to a signed-in one under deny', async () => {
		expect(refusalOf(await get('/nothing', anonymous)).status).toBe(401);
		expect(refusalOf(await get('/nothing')).status).toBe(403);
	});

	it('lets an unnamed route through under allow', async () => {
		const open = policyOf({ global: { unmatched: 'allow' } });
		const decision = await evaluateRest(open, {
			method: 'GET',
			path: '/x',
			claims: anonymous,
		});
		expect(decision.allow).toBe(true);
	});

	it('treats a method the path does not name as unmatched', async () => {
		const decision = await evaluateRest(policy, {
			method: 'POST',
			path: '/me',
			claims: user(),
		});
		expect(refusalOf(decision).status).toBe(403);
	});
});

describe('roles and permissions in disjunctive normal form', () => {
	it('holds on any alternative whose roles all hold', async () => {
		expect((await get('/documents/1', user({ roles: ['admin'] }))).allow).toBe(
			true,
		);
		const both = user({ roles: ['editor', 'reviewer'] });
		expect((await get('/documents/1', both)).allow).toBe(true);
	});

	it('does not hold on half an alternative', async () => {
		const half = user({ roles: ['editor'] });
		expect((await get('/documents/1', half)).allow).toBe(false);
	});

	const put = (claims: ReturnType<typeof user>) =>
		evaluateRest(policy, { method: 'put', path: '/documents/1', claims });

	it('reads a permission in the scope, and in the list when there is one', async () => {
		expect((await put(user({ scope: 'docs:write' }))).allow).toBe(true);
		expect(
			(await put(user({ scope: 'docs:write', permissions: ['docs:write'] })))
				.allow,
		).toBe(true);
		expect(
			(await put(user({ scope: 'docs:write', permissions: ['other'] }))).allow,
		).toBe(false);
	});

	it('needs the scope as well as the list', async () => {
		expect((await put(user({ permissions: ['docs:write'] }))).allow).toBe(
			false,
		);
	});

	it('takes the second alternative when both its permissions hold', async () => {
		const claims = user({ scope: 'docs:admin audit:read' });
		expect((await put(claims)).allow).toBe(true);
		expect((await put(user({ scope: 'docs:admin' }))).allow).toBe(false);
	});
});

describe('when', () => {
	const del = (id: string, conditions = policy) =>
		evaluateRest(conditions, {
			method: 'DELETE',
			path: `/documents/${id}`,
			claims: user(),
		});

	it('allows when every named condition is true', async () => {
		expect((await del('1')).allow).toBe(true);
	});

	it('sees the captured params of the path', async () => {
		expect(refusalOf(await del('bad')).status).toBe(403);
	});

	it('denies when a predicate answers false', async () => {
		const denying = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/a': { GET: { when: ['no'] } } },
			},
			{ no: async () => false },
		);
		const decision = await evaluateRest(denying, {
			method: 'GET',
			path: '/a',
			claims: user(),
		});
		expect(refusalOf(decision).status).toBe(403);
	});

	it('denies, and does not throw, when a predicate throws', async () => {
		const throwing = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/a': { GET: { when: ['boom'] } } },
			},
			{
				boom: () => {
					throw new Error('nope');
				},
			},
		);
		const decision = await evaluateRest(throwing, {
			method: 'GET',
			path: '/a',
			claims: user(),
		});
		expect(refusalOf(decision).code).toBe('auth.errors.forbidden');
	});
});

describe('a matched route and the path', () => {
	it('takes an already-matched route pattern, and its params from the request', async () => {
		const decision = await evaluateRest(policy, {
			method: 'DELETE',
			route: '/documents/:id',
			claims: user(),
			request: { params: { id: 'bad' } },
		});
		expect(refusalOf(decision).status).toBe(403);
	});

	it('takes the route with or without the basePath', async () => {
		const based = policyOf({
			global: { unmatched: 'deny', basePath: '/api' },
			rest: { '/me': { GET: { authenticated: true } } },
		});
		for (const route of ['/api/me', '/me']) {
			const decision = await evaluateRest(based, {
				method: 'GET',
				route,
				claims: user(),
			});
			expect(decision.allow).toBe(true);
		}
	});

	it('refuses a route pattern the table does not hold, under deny', async () => {
		const decision = await evaluateRest(policy, {
			method: 'GET',
			route: '/ghost',
			claims: user(),
		});
		expect(refusalOf(decision).status).toBe(403);
	});

	it('treats a route or path that is not a string as missing', async () => {
		const open = policyOf({
			global: { unmatched: 'allow' },
			rest: { '/docs/:id': { GET: { roles: [['admin']] } } },
		});
		for (const where of [
			{ route: null, path: null },
			{ path: null },
			{ route: null },
			{ path: 42 },
		]) {
			await expect(
				evaluateRest(open, {
					method: 'GET',
					claims: user(),
					...where,
				} as never),
			).rejects.toThrow('pass the `route` or the `path`');
		}
	});

	it('a route follows document order', async () => {
		const ordered = policyOf({
			global: { unmatched: 'deny' },
			rest: {
				'/notes/:id': { GET: { authenticated: true } },
				'/notes/new': { GET: { public: true } },
			},
		});
		const decision = await evaluateRest(ordered, {
			method: 'GET',
			route: '/notes/new',
			claims: anonymous,
		});
		expect(refusalOf(decision).status).toBe(401);
	});

	it('a literal route keeps the params the rule captures', async () => {
		const seen: unknown[] = [];
		const capturing = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/notes/:id': { GET: { when: ['see'] } } },
			},
			{
				see: ({ request }) => {
					seen.push((request as { params: unknown }).params);
					return true;
				},
			},
		);
		await evaluateRest(capturing, {
			method: 'GET',
			route: '/notes/new',
			claims: user(),
		});
		expect(seen).toEqual([{ id: 'new' }]);
	});

	it('a pattern route captures none', async () => {
		const seen: unknown[] = [];
		const capturing = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/notes/:id': { GET: { when: ['see'] } } },
			},
			{
				see: ({ request }) => {
					seen.push((request as { params: unknown }).params);
					return true;
				},
			},
		);
		await evaluateRest(capturing, {
			method: 'GET',
			route: '/notes/:slug',
			claims: user(),
		});
		expect(seen).toEqual([{}]);
	});

	it('needs a route or a path', async () => {
		await expect(
			evaluateRest(policy, { method: 'GET', claims: user() } as never),
		).rejects.toThrow('pass the `route` or the `path`');
	});
});

describe('HEAD', () => {
	const heads = policyOf({
		global: { unmatched: 'allow' },
		rest: { '/r': { GET: { roles: [['admin']] } } },
	});

	it('faces the GET rules too', async () => {
		const decision = await evaluateRest(heads, {
			method: 'HEAD',
			path: '/r',
			claims: user(),
		});
		expect(refusalOf(decision).status).toBe(403);
		const allowed = await evaluateRest(heads, {
			method: 'head',
			path: '/r',
			claims: user({ roles: ['admin'] }),
		});
		expect(allowed.allow).toBe(true);
	});
});
