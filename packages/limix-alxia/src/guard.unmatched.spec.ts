import { describe, expect, test } from 'bun:test';
import { call, guardedApp } from './app.fixtures';

describe('limixGuard, requests that reach no route', () => {
	test("an unknown path is alxia's 404, not a refusal, and claims is not read", async () => {
		let reads = 0;
		const app = guardedApp({
			claims: () => {
				reads++;
				return { authenticated: false };
			},
		});
		const res = await call(app, '/nope');
		expect(res.status).toBe(404);
		expect(reads).toBe(0);
	});

	test("a method the path does not take is alxia's 405", async () => {
		const res = await call(guardedApp(), '/open', { method: 'PUT' });
		expect(res.status).toBe(405);
	});

	test('a path under a mounted group is judged by its full declared path', async () => {
		const app = guardedApp();
		app.group('/v1', (g) => g.get('/me', ({ reply }) => reply(200, {})));
		expect((await call(app, '/v1/me', { who: 'admin' })).status).toBe(403);
	});
});
