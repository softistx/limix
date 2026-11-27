import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { call, expectStopped, ok, whoOf } from './app.fixtures';
import { limixGuard } from './guard';
import { checkGuard } from './setup-check';

const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/admin': { GET: { roles: [['admin']] } },
			'/api/admin': { GET: { roles: [['admin']] } },
		},
	}),
);

const heard = () => {
	const problems: (readonly string[])[] = [];
	return { problems, onMismatch: (p: readonly string[]) => problems.push(p) };
};

describe('limixGuard, every route of its app carries the guard', () => {
	test('a guard built before use(), with a route declared in between, refuses 503', async () => {
		const app = alxia();
		const spy = heard();
		const guard = limixGuard({ policy, claims: whoOf, app, ...spy });
		app.get('/admin', ok);
		app.use(guard);
		app.get('/api/admin', ok);
		const res = await call(app, '/api/admin', { who: 'admin' });
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({
			params: { reason: 'policy-mismatch' },
		});
		expect(spy.problems.flat().join('\n')).toContain('GET /admin');
	});

	test('a guard used in a group but given the parent app: the parent routes refuse 503', async () => {
		const app = alxia();
		const spy = heard();
		app.group('/api', (g) =>
			g
				.use(limixGuard({ policy, claims: whoOf, app, ...spy }))
				.get('/admin', ok),
		);
		app.get('/admin', ok);
		// The guarded route refuses, loudly: it runs the guard, which sees the parent's route does not.
		expect((await call(app, '/api/admin', { who: 'admin' })).status).toBe(503);
		expect(spy.problems.flat().join('\n')).toContain('GET /admin');
	});

	test('one guard instance used in a group, the app having a route outside it: the guarded route refuses 503', async () => {
		const app = alxia();
		const spy = heard();
		const guard = limixGuard({ policy, claims: whoOf, app, ...spy });
		app.group('/api', (g) => g.use(guard).get('/admin', ok));
		app.get('/admin', ok);
		expect((await call(app, '/api/admin', { who: 'admin' })).status).toBe(503);
		expect(spy.problems.flat().join('\n')).toContain('GET /admin');
	});

	test('a guard used first, with its routes after, is fine', async () => {
		const app = alxia();
		app.use(limixGuard({ policy, claims: whoOf, app }));
		app.get('/admin', ok);
		app.group('/api', (g) => g.get('/admin', ok));
		expect((await call(app, '/admin')).status).toBe(401);
		expect((await call(app, '/api/admin', { who: 'admin' })).status).toBe(200);
	});

	test('a route declared between the guard and its use() is named by checkGuard, and the app stops at start', async () => {
		const app = alxia();
		const guard = limixGuard({ policy, claims: whoOf, app });
		app.get('/admin', ok);
		app.use(guard);
		expect(checkGuard(guard, app).map((i) => [i.kind, i.path])).toEqual([
			['open-route', 'GET /admin'],
		]);
		await expectStopped(app, /stay open: GET \/admin/);
	});

	test('a route added late, outside the guard group, is caught the same way', async () => {
		const app = alxia();
		const guard = limixGuard({ policy, claims: whoOf, app });
		app.group('/api', (g) => g.use(guard).get('/admin', ok));
		expect(checkGuard(guard, app)).toEqual([]);
		app.get('/late', ok);
		expect(checkGuard(guard, app).map((i) => i.path)).toEqual(['GET /late']);
		await expectStopped(app, /GET \/late/);
	});

	test('an open route and separated guards together are both logged', async () => {
		const app = alxia();
		const guard = limixGuard({ policy, claims: whoOf, app });
		app.get('/early', ok);
		app.use(guard);
		app.use((async (_ctx: unknown, next: () => unknown) => next()) as never);
		app.group('/g', (group) =>
			group
				.use(limixGuard({ policy, claims: whoOf, app: group }))
				.get('/x', ok),
		);
		await expectStopped(
			app,
			/stay open: GET \/early\. Put `app\.use\(limixGuard/,
			/GET \/g\/x: a hook stands between this guard and the group's guard, so both judge it; put the group's guard first/,
		);
	});

	test('a well-formed app starts', async () => {
		const app = alxia();
		app.use(limixGuard({ policy, claims: whoOf, app }));
		app.get('/admin', ok);
		const server = await app.listen({ port: 0, hostname: '127.0.0.1' });
		await server.stop(true);
	});
});
