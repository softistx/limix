import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { call, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

const rules = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/page': { GET: { authenticated: true } },
			'/head-only': {
				HEAD: { roles: [['admin']] },
				GET: { authenticated: true },
			},
			'/any': { PUT: { roles: [['admin']] }, OPTIONS: { public: true } },
			'/search': { QUERY: { authenticated: true } },
			'/live': { GET: { authenticated: true } },
		},
	}),
);
const app = () => {
	const a = alxia();
	a.use(limixGuard({ policy: rules, claims: whoOf, app: a }));
	a.get('/page', ({ reply }) => reply(200, {}));
	a.get('/head-only', ({ reply }) => reply(200, {}));
	a.all('/any', ({ reply }) => reply(200, {}));
	a.query('/search', ({ reply }) => reply(200, {}));
	a.ws('/live', { message() {} });
	return a;
};

describe('limixGuard, methods', () => {
	test('HEAD is judged by the HEAD rules and then the GET rules', async () => {
		const a = app();
		expect((await call(a, '/page', { method: 'HEAD' })).status).toBe(401);
		expect(
			(await call(a, '/page', { method: 'HEAD', who: 'reader' })).status,
		).toBe(200);
		expect(
			(await call(a, '/head-only', { method: 'HEAD', who: 'reader' })).status,
		).toBe(403);
		expect(
			(await call(a, '/head-only', { method: 'HEAD', who: 'admin' })).status,
		).toBe(200);
		expect((await call(a, '/head-only', { who: 'reader' })).status).toBe(200);
	});

	test('an all route is judged per method', async () => {
		const a = app();
		expect((await call(a, '/any', { method: 'PUT' })).status).toBe(401);
		expect(
			(await call(a, '/any', { method: 'PUT', who: 'admin' })).status,
		).toBe(200);
		expect(
			(await call(a, '/any', { method: 'PATCH', who: 'admin' })).status,
		).toBe(403);
	});

	test('QUERY is a method like another', async () => {
		const a = app();
		expect((await call(a, '/search', { method: 'QUERY' })).status).toBe(401);
		expect(
			(await call(a, '/search', { method: 'QUERY', who: 'reader' })).status,
		).toBe(200);
	});

	test("a socket upgrade is a GET on its path, refused before the upgrade; a plain GET there is left to alxia's 426", async () => {
		const a = app();
		const upgrade = { upgrade: 'websocket', connection: 'Upgrade' };
		expect((await call(a, '/live', { headers: upgrade })).status).toBe(401);
		// Without a server to upgrade on, an allowed upgrade falls to the same 426.
		expect(
			(await call(a, '/live', { headers: upgrade, who: 'reader' })).status,
		).toBe(426);
		expect((await call(a, '/live')).status).toBe(426);
	});

	test('OPTIONS reaching a route is judged by its rule; a preflight middleware ahead of the guard answers first', async () => {
		const a = alxia();
		a.use(
			defineMiddleware(async (ctx, next) =>
				ctx.request.method === 'OPTIONS'
					? new Response(null, { status: 204 })
					: next(),
			),
		);
		a.use(limixGuard({ policy: rules, claims: whoOf, app: a }));
		a.all('/any', ({ reply }) => reply(200, {}));
		expect((await call(a, '/any', { method: 'OPTIONS' })).status).toBe(204);
		expect((await call(app(), '/any', { method: 'OPTIONS' })).status).toBe(200);
	});
});
