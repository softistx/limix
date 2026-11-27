import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy, mutableSource } from '@softistx/limix';
import { call, ok, whoOf } from './app.fixtures';
import { limixGuard } from './guard';
import { alxiaOperations, checkRoutes } from './index';

const outerRules = (unmatched: 'deny' | 'allow', health = '/health') =>
	compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched },
			rest: {
				[health as '/health']:
					unmatched === 'deny'
						? { GET: { public: true } }
						: { GET: { roles: [['admin']] } },
			},
		}),
	);

const consoleRules = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/console/users': { GET: { roles: [['admin']] } } },
	}),
);

const nestedRules = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/console/deep/items': { GET: { roles: [['reader']] } } },
	}),
);

const emptySource = mutableSource();

type App = ReturnType<typeof alxia>;

/** An outer app behind a guard, with a `/health` route and a `/console` group carrying a guard of its own. */
function withGroup(
	unmatched: 'deny' | 'allow' = 'deny',
	inner: (group: App) => unknown = (group) =>
		limixGuard({ policy: consoleRules, claims: whoOf, app: group }),
) {
	const app = alxia();
	app.use(limixGuard({ policy: outerRules(unmatched), claims: whoOf, app }));
	app.get('/health', ok);
	let made: App | undefined;
	app.group('/console', (group) => {
		made = group;
		const guard = inner(group);
		if (guard) group.use(guard as never);
		return group.get('/users', ok);
	});
	return { app, group: made as App };
}

describe('the innermost guard that owns a route judges it alone', () => {
	test('a group with its own guard: its rules decide, not the outer deny', async () => {
		const { app } = withGroup();
		expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
			200,
		);
	});

	test('the group guard judges an anonymous caller: 401 from the console rules', async () => {
		const { app } = withGroup();
		expect((await call(app, '/console/users')).status).toBe(401);
		expect((await call(app, '/console/users', { who: 'reader' })).status).toBe(
			403,
		);
	});

	test('under an outer allow, the outer rules stay on the outer routes', async () => {
		const { app } = withGroup('allow');
		expect((await call(app, '/health')).status).toBe(401);
		expect((await call(app, '/health', { who: 'admin' })).status).toBe(200);
		expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
			200,
		);
		expect((await call(app, '/console/users')).status).toBe(401);
	});

	test('a group without its own guard is judged by the outer rules (closed)', async () => {
		const { app } = withGroup('deny', () => undefined);
		expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
			403,
		);
	});

	test('an inner guard given the wrong app does not take the route: the outer rules judge', async () => {
		const other = alxia();
		const { app } = withGroup('deny', () =>
			limixGuard({ policy: consoleRules, claims: whoOf, app: other }),
		);
		expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
			403,
		);
	});

	test('an inner guard with no policy answers 503, even under an outer allow', async () => {
		const { app } = withGroup('allow', (group) =>
			limixGuard({ policy: emptySource, claims: whoOf, app: group }),
		);
		const res = await call(app, '/console/users', { who: 'admin' });
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({
			params: { reason: 'no-policy' },
		});
	});

	test('a host route after a prefixless plugin carrying a guard stays judged by the outer rules', async () => {
		const later = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { '/later': { GET: { roles: [['admin']] } } },
			}),
		);
		const app = alxia();
		app.use(limixGuard({ policy: later, claims: whoOf, app }));
		const plugin = alxia();
		plugin.use(
			limixGuard({
				policy: compilePolicy(
					definePolicy({
						limix: 1,
						global: { unmatched: 'allow' },
					}),
				),
				claims: whoOf,
				app: plugin,
			}),
		);
		plugin.get('/plug', ok);
		app.plugin(plugin);
		app.get('/later', ok);
		expect((await call(app, '/later')).status).toBe(401);
		expect((await call(app, '/later', { who: 'admin' })).status).toBe(200);
	});

	test('a plugin with a prefix and its own guard: its rules decide', async () => {
		const app = alxia();
		app.use(limixGuard({ policy: outerRules('deny'), claims: whoOf, app }));
		app.get('/health', ok);
		const plugin = alxia({ prefix: '/console' });
		plugin.use(
			limixGuard({ policy: consoleRules, claims: whoOf, app: plugin }),
		);
		plugin.get('/users', ok);
		app.plugin(plugin);
		expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
			200,
		);
		expect((await call(app, '/console/users')).status).toBe(401);
	});

	test('a host prefix with a group and its own guard: the full path is judged', async () => {
		const prefixed = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { '/api/console/users': { GET: { roles: [['admin']] } } },
			}),
		);
		const app = alxia({ prefix: '/api' });
		app.use(
			limixGuard({
				policy: outerRules('deny', '/api/health'),
				claims: whoOf,
				app,
			}),
		);
		app.get('/health', ok);
		app.group('/console', (group) =>
			group
				.use(limixGuard({ policy: prefixed, claims: whoOf, app: group }))
				.get('/users', ok),
		);
		expect(
			(await call(app, '/api/console/users', { who: 'admin' })).status,
		).toBe(200);
		expect((await call(app, '/api/console/users')).status).toBe(401);
	});

	test('three levels: only the innermost rules decide', async () => {
		const app = alxia();
		app.use(limixGuard({ policy: outerRules('deny'), claims: whoOf, app }));
		app.get('/health', ok);
		app.group('/console', (group) => {
			group.use(
				limixGuard({ policy: consoleRules, claims: whoOf, app: group }),
			);
			group.get('/users', ok);
			return group.group('/deep', (deep) =>
				deep
					.use(limixGuard({ policy: nestedRules, claims: whoOf, app: deep }))
					.get('/items', ok),
			);
		});
		expect(
			(await call(app, '/console/deep/items', { who: 'reader' })).status,
		).toBe(200);
		expect(
			(await call(app, '/console/deep/items', { who: 'admin' })).status,
		).toBe(403);
		expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
			200,
		);
		expect((await call(app, '/health')).status).toBe(200);
	});
});

describe('a path-scoped use of the inner guard', () => {
	// alxia keeps the hook on the routes its path matches and drops it from the
	// others, leaving no `when`. The route it matches is left to the inner guard,
	// which refuses it 503 (its own fit check sees /other unguarded); the other
	// route never reaches the inner guard, so the outer rules judge it. Closed both ways.
	test("the route it matches is the inner guard's (503: it does not fit), the other is the outer rules'", async () => {
		const app = alxia();
		app.use(limixGuard({ policy: outerRules('deny'), claims: whoOf, app }));
		app.get('/health', ok);
		app.group('/console', (group) =>
			group
				.use(
					'/users',
					limixGuard({ policy: consoleRules, claims: whoOf, app: group }),
				)
				.get('/users', ok)
				.get('/other', ok),
		);
		const spy = spyOn(console, 'error').mockImplementation(() => {});
		try {
			const users = await call(app, '/console/users', { who: 'admin' });
			expect(users.status).toBe(503);
			const other = await call(app, '/console/other', { who: 'admin' });
			expect(other.status).toBe(403);
		} finally {
			spy.mockRestore();
		}
	});
});

describe('coverage of an app and of a group', () => {
	test('alxiaOperations(app) leaves out the routes a group guard judges; the group lists them', () => {
		const { app, group } = withGroup();
		const outer = alxiaOperations(app).map((o) => `${o.method} ${o.path}`);
		expect(outer).toEqual(['GET /health', 'HEAD /health']);
		const inner = alxiaOperations(group).map((o) => `${o.method} ${o.path}`);
		expect(inner).toEqual(['GET /console/users', 'HEAD /console/users']);
	});

	test('an outer rule left for a route a group guard judges is not taken: checkRoutes reports it', () => {
		const stale = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'/health': { GET: { public: true } },
					'/console/users': { GET: { roles: [['admin']] } },
				},
			}),
		);
		const app = alxia();
		const guard = limixGuard({ policy: stale, claims: whoOf, app });
		app.use(guard);
		app.get('/health', ok);
		app.group('/console', (group) =>
			group
				.use(limixGuard({ policy: consoleRules, claims: whoOf, app: group }))
				.get('/users', ok),
		);
		const issues = checkRoutes(stale, app);
		expect(issues.map((i) => [i.kind, i.path])).toEqual([
			['unmatched-rule', 'GET /console/users'],
		]);
	});
});
