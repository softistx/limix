import { describe, expect, it } from 'bun:test';
import {
	anonymous,
	policyOf,
	recordingChecker,
	user,
} from './evaluation.fixtures';
import { explain } from './explain';
import { evaluateField } from './field';
import type { Decision } from './refusal';
import { evaluateRest } from './rest';

const status = (decision: Decision) =>
	decision.allow ? 200 : decision.refusal.status;

describe('REST: flat keys and the method *', () => {
	const call = (
		policy: ReturnType<typeof policyOf>,
		method: string,
		path: string,
		claims = user(),
	) => evaluateRest(policy, { method, path, claims });

	it('applies a later "* /x/*" to a method the earlier exact rule does not name', async () => {
		const policy = policyOf({
			global: { unmatched: 'allow' },
			rest: {
				'/x/:id': { GET: { public: true } },
				'* /x/*': { roles: [['admin']] },
			},
		});
		expect(status(await call(policy, 'POST', '/x/1'))).toBe(403);
		expect(status(await call(policy, 'GET', '/x/1'))).toBe(200);
	});

	it('lets an earlier "* /x/*" win over a later exact rule of another key', async () => {
		const policy = policyOf({
			global: { unmatched: 'allow' },
			rest: {
				'* /x/*': { roles: [['admin']] },
				'GET /x/:id': { public: true },
			},
		});
		expect(status(await call(policy, 'GET', '/x/1'))).toBe(403);
	});

	it('lets the exact method beat * on the same key, wherever it is written', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: {
				'/open': { GET: { public: true }, '*': { roles: [['admin']] } },
				'GET /later': { public: true },
				'* /later': { roles: [['admin']] },
			},
		});
		expect(status(await call(policy, 'GET', '/open', anonymous))).toBe(200);
		expect(status(await call(policy, 'POST', '/open'))).toBe(403);
		expect(status(await call(policy, 'GET', '/later', anonymous))).toBe(200);
		expect(status(await call(policy, 'DELETE', '/later'))).toBe(403);
	});

	it('gives a method outside the enum the * rules', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: { '* /dav/*': { roles: [['admin']] } },
		});
		expect(status(await call(policy, 'PROPFIND', '/dav/a'))).toBe(403);
		expect(
			status(
				await call(policy, 'PROPFIND', '/dav/a', user({ roles: ['admin'] })),
			),
		).toBe(200);
	});

	it('evaluates a wildcard once for HEAD, relations included', async () => {
		const { checker, calls } = recordingChecker();
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: {
				'* /docs/:id': {
					relations: [{ require: [[{ relation: 'view', type: 'doc' }]] }],
				},
			},
		});
		const decision = await evaluateRest(policy, {
			method: 'HEAD',
			path: '/docs/1',
			claims: user(),
			relations: checker,
		});
		expect(decision.allow).toBe(true);
		expect(calls).toHaveLength(1);
	});

	it('still evaluates a HEAD rule and the GET rule both', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: {
				'HEAD /a': { public: true },
				'GET /a': { roles: [['admin']] },
			},
		});
		expect(status(await call(policy, 'HEAD', '/a'))).toBe(403);
	});

	it('leaves a request unmatched when no * rule takes it', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: { '* /admin/*': { roles: [['admin']] } },
		});
		expect(status(await call(policy, 'GET', '/other'))).toBe(403);
		expect(status(await call(policy, 'GET', '/other', anonymous))).toBe(401);
	});

	it('refuses a CORS preflight on an authenticated * rule unless OPTIONS is public', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: {
				'/api/a': { '*': { authenticated: true } },
				'OPTIONS /api/a': { public: true },
				'* /api/b': { authenticated: true },
			},
		});
		expect(status(await call(policy, 'OPTIONS', '/api/a', anonymous))).toBe(
			200,
		);
		expect(status(await call(policy, 'OPTIONS', '/api/b', anonymous))).toBe(
			401,
		);
	});

	it('applies basePath to flat keys', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny', basePath: '/api' },
			rest: { 'POST /users/:id': { roles: [['admin']] } },
		});
		expect(status(await call(policy, 'POST', '/api/users/1'))).toBe(403);
		expect(
			(
				await evaluateRest(policy, {
					method: 'POST',
					route: '/users/:id',
					claims: user({ roles: ['admin'] }),
				})
			).allow,
		).toBe(true);
	});

	it('matches a bare * as the rest of the path without a parameter', async () => {
		const policy = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { 'GET /files/*': { when: ['noParams'] } },
			},
			{
				noParams: ({ request }) =>
					Object.keys((request as { params: object }).params).length === 0,
			},
		);
		expect(status(await call(policy, 'GET', '/files/a/b/c'))).toBe(200);
	});
});

describe('GraphQL: Type.* and flat keys', () => {
	const policy = policyOf({
		global: { unmatched: 'deny' },
		graphql: {
			'Query.me': { public: true },
			'Query.*': { roles: [['admin']] },
			'Note.*': { authenticated: true },
			Note: { id: { public: true } },
		},
	});
	const field = (type: string, name: string, claims = user(), root?: boolean) =>
		evaluateField(policy, { type, field: name, claims, root });

	it('covers every root field of the type and lets the exact field win', async () => {
		expect(status(await field('Query', 'me', anonymous))).toBe(200);
		expect(status(await field('Query', 'other'))).toBe(403);
		expect(
			status(await field('Query', 'other', user({ roles: ['admin'] }))),
		).toBe(200);
	});

	it('guards every field of a non-root type, an exact one apart', async () => {
		expect(status(await field('Note', 'title', anonymous))).toBe(401);
		expect(status(await field('Note', 'title'))).toBe(200);
		expect(status(await field('Note', 'id', anonymous))).toBe(200);
	});

	it('lets a wildcard root rule through under unmatched: deny', async () => {
		expect(status(await field('Query', 'x', user({ roles: ['admin'] })))).toBe(
			200,
		);
	});

	it('leaves other types alone', async () => {
		expect(status(await field('Other', 'x', anonymous))).toBe(200);
		expect(status(await field('Mutation', 'x', anonymous))).toBe(401);
	});

	it('does not read an inherited key as a wildcard', async () => {
		const bare = policyOf({
			global: { unmatched: 'allow' },
			graphql: { 'Query.me': { public: true } },
		});
		expect(
			status(
				await evaluateField(bare, {
					type: 'Query',
					field: 'constructor',
					claims: anonymous,
				}),
			),
		).toBe(200);
	});
});

describe('explain: wildcard labels', () => {
	it('labels a method wildcard with its own method and a Type.* hit with its pattern', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: { '* /api/admin/*': { authenticated: true } },
			graphql: { 'Query.*': { authenticated: true } },
		});
		const rest = await explain(policy, {
			method: 'PUT',
			path: '/api/admin/x',
			claims: user(),
		});
		expect(rest.steps[0]).toEqual({
			kind: 'match',
			label: '* /api/admin/*',
			passed: true,
		});
		const field = await explain(policy, {
			type: 'Query',
			field: 'me',
			claims: user(),
		});
		expect(field.steps[0]).toMatchObject({
			kind: 'match',
			label: 'Query.me (Query.*)',
		});
	});
});
