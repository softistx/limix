import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { LimixRefusal } from '@softistx/limix';
import { call, guardedApp, policy, routesOn, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

describe('limixGuard, decisions', () => {
	test('a public route answers anyone', async () => {
		const res = await call(guardedApp(), '/open');
		expect([res.status, await res.json()]).toEqual([200, { ok: 'open' }]);
	});

	test('anonymous is 401, authenticated without the role 403, with the role 200', async () => {
		const app = guardedApp();
		const anon = await call(app, '/notes/1');
		expect(anon.status).toBe(401);
		expect(await anon.json()).toEqual({ code: 'auth.errors.unauthenticated' });
		const denied = await call(app, '/notes/1', {
			method: 'DELETE',
			who: 'reader',
		});
		expect(denied.status).toBe(403);
		expect(await denied.json()).toEqual({ code: 'auth.errors.forbidden' });
		const allowed = await call(app, '/notes/1', {
			method: 'DELETE',
			who: 'admin',
		});
		expect([allowed.status, await allowed.json()]).toEqual([
			200,
			{ ok: 'deleted' },
		]);
	});

	test('a route no rule names is refused under unmatched: deny', async () => {
		const app = guardedApp();
		app.get('/secret', ({ reply }) => reply(200, {}));
		const res = await call(app, '/secret', { who: 'admin' });
		expect(res.status).toBe(403);
	});

	test('a wildcard rule takes the rest of the path, and the path is a parameter', async () => {
		const app = guardedApp();
		expect((await call(app, '/files/a/b/c')).status).toBe(401);
		expect((await call(app, '/files/a/b/c', { who: 'reader' })).status).toBe(
			200,
		);
	});

	test('the query string does not change what a rule names', async () => {
		expect((await call(guardedApp(), '/open?x=1')).status).toBe(200);
	});

	test('a handler is never run for a refused request', async () => {
		let ran = 0;
		const app = guardedApp();
		app.get('/me/ran', ({ reply }) => {
			ran++;
			return reply(200, {});
		});
		await call(app, '/me/ran');
		expect(ran).toBe(0);
	});
});

describe('limixGuard, formats', () => {
	test('a problem app gets application/problem+json with the code', async () => {
		const res = await call(guardedApp({}, 'problem'), '/me');
		expect(res.status).toBe(401);
		expect(res.headers.get('content-type')).toContain(
			'application/problem+json',
		);
		expect(await res.json()).toMatchObject({
			status: 401,
			code: 'auth.errors.unauthenticated',
			detail: 'auth.errors.unauthenticated',
			instance: '/me',
		});
	});

	test('what an earlier middleware set on the response reaches the refusal', async () => {
		const app = alxia();
		app.use(
			defineMiddleware(async (ctx, next) => {
				ctx.set.headers.set('access-control-allow-origin', '*');
				return next();
			}),
		);
		app.use(limixGuard({ policy, claims: whoOf, app }));
		routesOn(app);
		const res = await call(app, '/me');
		expect(res.status).toBe(401);
		expect(res.headers.get('access-control-allow-origin')).toBe('*');
	});
});

describe('limixGuard, claims', () => {
	test('claims is read once per request that reaches a route, with the context', async () => {
		let reads = 0;
		const app = guardedApp({
			claims: (ctx) => {
				reads++;
				expect(ctx.request).toBeInstanceOf(Request);
				return { authenticated: true };
			},
		});
		await call(app, '/me');
		await call(app, '/me');
		expect(reads).toBe(2);
	});

	test('a refusal-shaped error thrown by claims is answered with its own code', async () => {
		const app = guardedApp({
			claims: () => {
				throw Object.assign(new Error('no tenant'), {
					code: 'tenancy.errors.no-tenant',
					status: 404,
					params: { host: 'x' },
				});
			},
		});
		const res = await call(app, '/me');
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({
			code: 'tenancy.errors.no-tenant',
			params: { host: 'x' },
		});
	});

	test('any other error from claims is a 500, never an allow', async () => {
		const app = guardedApp({
			claims: () => {
				throw new Error('db down');
			},
		});
		expect((await call(app, '/open')).status).toBe(500);
	});

	test('claims that are not an object are a 500', async () => {
		const app = guardedApp({ claims: () => null as never });
		expect((await call(app, '/open')).status).toBe(500);
	});
});

describe('limixGuard, mapRefusal', () => {
	test('rewords the answer and sees the context', async () => {
		const app = guardedApp({
			mapRefusal: (refusal, ctx) => ({
				code: `app.${refusal.code}`,
				status: refusal.status === 401 ? 403 : 404,
				detail: ctx.request.method,
			}),
		});
		const res = await call(app, '/me');
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({
			code: 'app.auth.errors.unauthenticated',
			message: 'GET',
		});
	});

	test('can answer with a Response, and sees a limix refusal as the plain shape', async () => {
		const seen: unknown[] = [];
		const app = guardedApp({
			mapRefusal: (refusal) => {
				seen.push(refusal instanceof LimixRefusal, refusal.params);
				return new Response('gone', { status: 410 });
			},
		});
		const res = await call(app, '/me');
		expect([res.status, await res.text()]).toEqual([410, 'gone']);
		expect(seen).toEqual([true, {}]);
	});
});
