import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { call, ok, policy, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

const guardOf = (app: ReturnType<typeof alxia>) =>
	limixGuard({ policy, claims: whoOf, app });

describe('limixGuard, routes declared before it', () => {
	test('a route declared before the guard throws at the guard, naming the route and the fix', () => {
		const app = alxia();
		app.get('/admin/secret', ok);
		app.post('/notes/early', ok);
		let message = '';
		try {
			guardOf(app);
		} catch (error) {
			message = error instanceof TypeError ? error.message : String(error);
		}
		expect(message).toStartWith(
			'limixGuard(): routes declared before the guard never run it and stay open: GET /admin/secret, POST /notes/early',
		);
		expect(message).toContain('Declare the guard first, then the routes');
		expect(message).toContain('`public: true`');
	});

	test('a socket declared before the guard throws too, named WS', () => {
		const app = alxia();
		app.ws('/sock', { message() {} });
		expect(() => guardOf(app)).toThrow(/stay open: WS \/sock/);
	});

	test('a group guard throws for the group routes declared before it, not for the parent ones', () => {
		const app = alxia();
		app.get('/outside', ok);
		app.group('/g', (g) => {
			expect(() => limixGuard({ policy, claims: whoOf, app: g })).not.toThrow();
			return g;
		});
	});

	test('the guard first, then the routes: the route is judged, a health route has a public rule', async () => {
		const app = alxia();
		app.use(guardOf(app));
		app.get('/admin/secret', ok);
		app.get('/open', ok);
		expect((await call(app, '/admin/secret')).status).toBe(503);
		expect((await call(app, '/open')).status).toBe(503);
	});
});
