import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { call, ok, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

const rules = (rest: Record<string, object>) =>
	compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: rest as never,
		}),
	);

const echo = ({ pathParams, reply }: never) =>
	(reply as (s: number, b: object) => unknown)(200, { pathParams });

function appOf(
	policy: ReturnType<typeof rules>,
	build: (app: ReturnType<typeof alxia>) => unknown,
	prefix: '' | `/${string}` = '',
) {
	const app = alxia(prefix === '' ? {} : { prefix });
	app.use(limixGuard({ policy, claims: whoOf, app }));
	build(app);
	return app;
}

const users = rules({
	'/users/me': { GET: { roles: [['admin']] } },
	'/users/:id': { GET: { public: true } },
});

describe('limixGuard judges the decoded path, not the route pattern', () => {
	test('a literal rule before a parameter rule applies to the request it names', async () => {
		const app = appOf(users, (a) => a.get('/users/:id', ok));
		expect((await call(app, '/users/me')).status).toBe(401);
		expect((await call(app, '/users/me', { who: 'admin' })).status).toBe(200);
		expect((await call(app, '/users/other')).status).toBe(200);
	});

	test('with only the literal rule and unmatched allow, the literal still binds', async () => {
		const only = rules({ '/users/me': { GET: { roles: [['admin']] } } });
		const app = appOf(only, (a) => a.get('/users/:id', ok));
		expect((await call(app, '/users/me')).status).toBe(401);
		expect((await call(app, '/users/you')).status).toBe(200);
	});

	test('a percent-encoded segment is judged as what it decodes to', async () => {
		const app = appOf(users, (a) => a.get('/users/:id', ok));
		expect((await call(app, '/users/%6De')).status).toBe(401);
	});

	test('a trailing slash is judged as the path without it', async () => {
		const app = appOf(users, (a) => a.get('/users/:id', ok));
		expect((await call(app, '/users/me/')).status).toBe(401);
	});

	test('an encoded slash inside a parameter stays one segment', async () => {
		const policy = rules({
			'/users/:id': { GET: { roles: [['admin']] } },
			'/users/:id/posts': { GET: { public: true } },
		});
		const app = appOf(policy, (a) => {
			a.get('/users/:id', ok);
			a.get('/users/:id/posts', ok);
		});
		const encoded = await call(app, '/users/a%2Fposts');
		expect(encoded.status).toBe(401);
		expect((await call(app, '/users/a/posts')).status).toBe(200);
	});

	test('an encoded percent inside a parameter stays a literal percent', async () => {
		const policy = rules({
			'/users/:id': { GET: { roles: [['admin']] } },
			'/users/me': { GET: { public: true } },
		});
		const app = appOf(policy, (a) => a.get('/users/:id', ok));
		expect((await call(app, '/users/%256De')).status).toBe(401);
	});

	test('a wildcard keeps its slashes, and the prefix stays', async () => {
		const policy = rules({
			'/api/files/private/*path': { GET: { roles: [['admin']] } },
			'/api/files/*path': { GET: { public: true } },
		});
		const app = appOf(policy, (a) => a.get('/files/*', ok), '/api');
		expect((await call(app, '/api/files/private/a/b')).status).toBe(401);
		expect((await call(app, '/api/files/public/a/b')).status).toBe(200);
		expect((await call(app, '/api/files/%70rivate/a')).status).toBe(401);
	});

	test('the handler still gets its own decoded parameters', async () => {
		const app = appOf(users, (a) => a.get('/users/:id', echo as never));
		const body = (await (await call(app, '/users/a%2Fb')).json()) as {
			pathParams: Record<string, string>;
		};
		expect(body.pathParams['id']).toBe('a/b');
	});
});

describe('limixGuard, a wildcard rule and its tail', () => {
	const files = rules({ '/files/*path': { GET: { roles: [['admin']] } } });
	const build = (prefix: '' | `/${string}` = '') =>
		appOf(files, (a) => a.get('/files/*', ok), prefix);

	test('an empty tail is still judged by the wildcard rule', async () => {
		const app = build();
		expect((await call(app, '/files')).status).toBe(401);
		expect((await call(app, '/files/')).status).toBe(401);
		expect((await call(app, '/files', { who: 'admin' })).status).toBe(200);
	});

	test('so is an empty tail on a prefixed wildcard route', async () => {
		const policy = rules({ '/api/*path': { GET: { roles: [['admin']] } } });
		const app = appOf(policy, (a) => a.get('/*', ok), '/api');
		expect((await call(app, '/api')).status).toBe(401);
		expect((await call(app, '/api/')).status).toBe(401);
	});

	test('a percent in a wildcard value is judged, not a 500', async () => {
		const app = build();
		expect((await call(app, '/files/100%25')).status).toBe(401);
		expect((await call(app, '/files/100%25/a', { who: 'admin' })).status).toBe(
			200,
		);
	});
});

describe('limixGuard, an empty tail under a parameter route', () => {
	const cases: [string, Record<string, Record<string, object>>][] = [
		[
			'a literal wildcard rule before the parameter one',
			{
				'/users/me/*path': { GET: { roles: [['admin']] } },
				'/users/:id/*path': { GET: { public: true } },
			},
		],
		[
			'a literal rule before the parameter one',
			{
				'/users/me': { GET: { roles: [['admin']] } },
				'/users/:id/*path': { GET: { public: true } },
			},
		],
		[
			'an optional-group rule before the parameter one',
			{
				'/users/me{/*path}': { GET: { roles: [['admin']] } },
				'/users/:id/*path': { GET: { public: true } },
			},
		],
	];
	for (const [name, rest] of cases) {
		test(`${name}: anonymous /users/me is refused, others are not`, async () => {
			const app = appOf(rules(rest), (a) => a.get('/users/:id/*', ok));
			expect((await call(app, '/users/me')).status).toBe(401);
			expect((await call(app, '/users/me/')).status).toBe(401);
			expect((await call(app, '/users/me', { who: 'admin' })).status).toBe(200);
			expect((await call(app, '/users/you')).status).toBe(200);
		});
	}

	test('with no wildcard rule the empty tail falls to unmatched', async () => {
		const policy = rules({ '/x/_': { GET: { roles: [['admin']] } } });
		const app = appOf(policy, (a) => a.get('/x/*', ok));
		expect((await call(app, '/x')).status).toBe(200);
	});
});

describe('limixGuard, a rule with a bare * and one for any method', () => {
	test('a bare * rule judges an empty tail too', async () => {
		const policy = rules({ 'GET /files/*': { roles: [['admin']] } });
		const app = appOf(policy, (a) => a.get('/files/*', ok));
		expect((await call(app, '/files')).status).toBe(401);
		expect((await call(app, '/files/a/b')).status).toBe(401);
		expect((await call(app, '/files', { who: 'admin' })).status).toBe(200);
	});

	test('a `*` method rule judges every method, and an earlier exact one of another key wins', async () => {
		const policy = rules({
			'GET /admin/health': { public: true },
			'* /admin/*': { roles: [['admin']] },
		});
		const app = appOf(policy, (a) => {
			a.get('/admin/*', ok);
			a.post('/admin/*', ok);
		});
		expect((await call(app, '/admin/x')).status).toBe(401);
		expect((await call(app, '/admin/x', { method: 'POST' })).status).toBe(401);
		expect((await call(app, '/admin/health')).status).toBe(200);
		expect(
			(await call(app, '/admin/x', { method: 'POST', who: 'admin' })).status,
		).toBe(200);
	});
});
