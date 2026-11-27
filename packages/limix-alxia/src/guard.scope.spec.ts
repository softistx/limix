import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { call, ok, whoOf } from './app.fixtures';
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

/** alxia only logs what an onStart hook throws: the guard's hook stops the server, then throws. */
async function expectStopped(app: ReturnType<typeof alxia>, message: RegExp) {
	const logged = spyOn(console, 'error').mockImplementation(() => {});
	try {
		const server = await app.listen({ port: 0, hostname: '127.0.0.1' });
		const { port } = server as unknown as { port: number };
		await Bun.sleep(50);
		expect(String(logged.mock.calls[0]?.[0])).toMatch(message);
		await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
	} finally {
		logged.mockRestore();
	}
}

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
		expect(() => checkGuard(guard, app)).toThrow(
			/^checkGuard\(\): routes that never run the guard and stay open: GET \/admin\./,
		);
		await expectStopped(app, /stay open: GET \/admin/);
	});

	test('a route added late, outside the guard group, is caught the same way', async () => {
		const app = alxia();
		const guard = limixGuard({ policy, claims: whoOf, app });
		app.group('/api', (g) => g.use(guard).get('/admin', ok));
		expect(() => checkGuard(guard, app)).not.toThrow();
		app.get('/late', ok);
		expect(() => checkGuard(guard, app)).toThrow(/GET \/late/);
		await expectStopped(app, /GET \/late/);
	});

	test('a well-formed app starts', async () => {
		const app = alxia();
		app.use(limixGuard({ policy, claims: whoOf, app }));
		app.get('/admin', ok);
		const server = await app.listen({ port: 0, hostname: '127.0.0.1' });
		await server.stop(true);
	});
});
