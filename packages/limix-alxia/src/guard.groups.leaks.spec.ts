import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { call, ok, whoOf } from './app.fixtures';
import { limixGuard } from './guard';
import { checkGuard } from './setup-check';

const rules = (
	unmatched: 'deny' | 'allow',
	rest: Record<string, unknown>,
	basePath?: string,
) =>
	compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched, ...(basePath ? { basePath } : {}) },
			rest,
		} as never),
	);

const adminOnly = { GET: { roles: [['admin']] } };
const health = { '/health': { GET: { public: true } } };
const list = ({ reply }: { reply: (s: 200, b: object) => never }) =>
	reply(200, { secret: 'user list' });

/** A middleware that answers from a store, like a cache keyed by the path: it answers unjudged by any guard after it. */
const cacheLike = () => {
	const store = new Map<string, Response>();
	return async (
		ctx: { request: Request },
		next: () => Promise<Response> | Response,
	) => {
		const key = new URL(ctx.request.url).pathname;
		const hit = store.get(key);
		if (hit) return hit.clone();
		const res = await next();
		if (res.status === 200) store.set(key, res.clone());
		return res;
	};
};

const consoleRules = rules('deny', { '/console/users': adminOnly });

describe('a hook between the outer guard and the group guard', () => {
	for (const where of [
		'outer app, after its guard',
		'group, before its guard',
	]) {
		test(`${where}: the outer guard still judges, so a warm cache never opens the route`, async () => {
			const app = alxia();
			const outer = limixGuard({
				policy: rules('deny', { ...health, '/console/users': adminOnly }),
				claims: whoOf,
				app,
			});
			app.use(outer);
			if (where.startsWith('outer')) app.use(cacheLike() as never);
			app.get('/health', ok);
			app.group('/console', (group) => {
				if (where.startsWith('group')) group.use(cacheLike() as never);
				return group
					.use(limixGuard({ policy: consoleRules, claims: whoOf, app: group }))
					.get('/users', list as never);
			});
			expect((await call(app, '/console/users', { who: 'admin' })).status).toBe(
				200,
			);
			expect((await call(app, '/console/users')).status).toBe(401);
			expect(() => checkGuard(outer, app)).toThrow(
				/GET \/console\/users: a hook stands between this guard and the group's guard, so both judge it; put the group's guard first in the group and limixGuard last among the app's own middlewares/,
			);
		});
	}
});

describe('a guarded plugin the guard cannot place exactly is judged by both guards', () => {
	const pluginRules = (path: string) =>
		rules('allow', { [path]: { GET: { public: true } } });

	test('a plugin inside a prefixed group', async () => {
		const app = alxia();
		app.use(
			limixGuard({
				policy: rules('deny', { ...health, '/g/users': adminOnly }),
				claims: whoOf,
				app,
			}),
		);
		app.get('/health', ok);
		app.group('/g', (group) => {
			const plugin = alxia();
			plugin.use(
				limixGuard({
					policy: pluginRules('/users'),
					claims: whoOf,
					app: plugin,
				}),
			);
			plugin.get('/users', list as never);
			return group.plugin(plugin);
		});
		expect((await call(app, '/g/users')).status).toBe(401);
	});

	test('a plugin under a host prefix', async () => {
		const app = alxia({ prefix: '/api' });
		app.use(
			limixGuard({
				policy: rules('deny', {
					'/api/health': { GET: { public: true } },
					'/api/users': adminOnly,
				}),
				claims: whoOf,
				app,
			}),
		);
		app.get('/health', ok);
		const plugin = alxia();
		plugin.use(
			limixGuard({ policy: pluginRules('/users'), claims: whoOf, app: plugin }),
		);
		plugin.get('/users', list as never);
		app.plugin(plugin);
		expect((await call(app, '/api/users')).status).toBe(401);
	});

	test('one plugin mounted twice, under two groups', async () => {
		const app = alxia();
		app.use(
			limixGuard({
				policy: rules('deny', {
					...health,
					'/a/users': adminOnly,
					'/b/users': adminOnly,
				}),
				claims: whoOf,
				app,
			}),
		);
		app.get('/health', ok);
		const plugin = alxia();
		plugin.use(
			limixGuard({ policy: pluginRules('/users'), claims: whoOf, app: plugin }),
		);
		plugin.get('/users', list as never);
		app.group('/a', (group) => group.plugin(plugin));
		app.group('/b', (group) => group.plugin(plugin));
		expect((await call(app, '/a/users')).status).toBe(401);
		expect((await call(app, '/b/users')).status).toBe(401);
	});
});

describe('a prefixless plugin guard that leaked onto host routes', () => {
	function leaking(extra: Record<string, unknown>) {
		const app = alxia();
		app.use(
			limixGuard({
				policy: rules('deny', {
					...health,
					...extra,
				}),
				claims: whoOf,
				app,
			}),
		);
		app.get('/health', ok);
		const plugin = alxia();
		plugin.use(
			limixGuard({
				policy: rules('allow', { '/users': { GET: { public: true } } }),
				claims: whoOf,
				app: plugin,
			}),
		);
		plugin.get('/users', list as never);
		app.plugin(plugin);
		return app;
	}

	test('a host route reusing the plugin handler at a longer path is judged by the outer rules', async () => {
		const app = leaking({ '/admin/users': adminOnly, '/xusers': adminOnly });
		app.get('/admin/users', list as never);
		app.get('/xusers', list as never);
		expect((await call(app, '/admin/users')).status).toBe(401);
		expect((await call(app, '/xusers')).status).toBe(401);
	});

	test('a host route at another method on the plugin path and handler is judged by the outer rules', async () => {
		const app = leaking({ '/users': { POST: { roles: [['admin']] } } });
		app.post('/users', list as never);
		expect((await call(app, '/users', { method: 'POST' })).status).toBe(401);
	});
});

describe('a guard used twice on one app', () => {
	test('never leaves a route to itself', async () => {
		const app = alxia();
		const guard = limixGuard({
			policy: rules('deny', { '/x': adminOnly }),
			claims: whoOf,
			app,
		});
		app.use(guard);
		app.use(guard);
		app.get('/x', list as never);
		expect((await call(app, '/x')).status).toBe(401);
		expect((await call(app, '/x', { who: 'admin' })).status).toBe(200);
	});
});
