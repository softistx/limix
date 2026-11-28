import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { buildSchema, type GraphQLObjectType } from 'graphql';
import { ok, whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import type { LimixAlxiaOptions } from '../options';
import { limixGraphql } from './limix-graphql';

type Options = LimixAlxiaOptions<{ request: Request }>;
type App = ReturnType<typeof alxia>;

const schemaOf = (sdl: string, type: string, field: string) => {
	const built = buildSchema(sdl);
	const found = (built.getType(type) as GraphQLObjectType).getFields()[field];
	if (found) found.resolve = (() => field) as never;
	return built;
};
const outerSchema = () => schemaOf('type Query { me: String }', 'Query', 'me');
const consoleSchema = () =>
	schemaOf('type Query { stats: String }', 'Query', 'stats');

const rules = (unmatched: 'deny' | 'allow', graphql: object, rest: object) =>
	compilePolicy(
		definePolicy({ limix: 1, global: { unmatched }, rest, graphql } as never),
	);
/** The host's rules allow every REST route: a 403 can only come from the plugin's guard. */
const hostRules = rules('allow', { Query: { me: { public: true } } }, {});
/** The plugin's rules deny every REST route and give `stats` to the admin. */
const pluginRules = rules(
	'deny',
	{ Query: { stats: { roles: [['admin']] } } },
	{},
);

const send = (
	app: App,
	path: string,
	init: { method?: string; who?: string; source?: string } = {},
) => {
	const method = init.method ?? 'POST';
	return Promise.resolve(
		app.fetch(
			new Request(`http://localhost${path}`, {
				method,
				headers: {
					'content-type': 'application/json',
					...(init.who ? { 'x-who': init.who } : {}),
				},
				...(method === 'GET' || method === 'HEAD'
					? {}
					: { body: JSON.stringify({ query: init.source ?? '{ stats }' }) }),
			}),
		),
	);
};
const status = async (...args: Parameters<typeof send>) =>
	(await send(...args)).status;

const optionsOf = (policy: Options['policy'], app: object): Options => ({
	policy,
	claims: whoOf,
	app: app as never,
});

/** The host: its guard (REST allowed), under `/api`, with its own endpoint. */
function host(prefix: `/${string}` | '' = '/api') {
	const app = alxia(prefix === '' ? {} : { prefix });
	const limix = optionsOf(hostRules, app);
	app.use(limixGuard(limix));
	limixGraphql(app, { schema: outerSchema(), limix });
	return app;
}

/** A guarded plugin whose endpoint sits at `path` (under its own `prefix`, when it has one). */
function guardedPlugin(path: `/${string}`, prefix?: `/${string}`) {
	const plugin = alxia(prefix === undefined ? {} : { prefix });
	const limix = optionsOf(pluginRules, plugin);
	plugin.use(limixGuard(limix));
	limixGraphql(plugin, { schema: consoleSchema(), limix, path });
	return plugin;
}

const ENDPOINT = '/api/console/graphql';

describe('a guarded plugin under a host prefix', () => {
	test('a prefixless plugin: its endpoint is judged by its field rules', async () => {
		const app = host();
		app.plugin(guardedPlugin('/console/graphql'));
		expect(await status(app, ENDPOINT)).toBe(401);
		expect(await status(app, ENDPOINT, { who: 'admin' })).toBe(200);
		expect(
			await status(app, '/api/graphql', { source: '{ me }', who: 'admin' }),
		).toBe(200);
	});

	test('a prefixed plugin: the same answers', async () => {
		const app = host();
		app.plugin(guardedPlugin('/graphql', '/console'));
		expect(await status(app, ENDPOINT)).toBe(401);
		expect(await status(app, ENDPOINT, { who: 'admin' })).toBe(200);
	});

	test('a plugin inside a prefixed group', async () => {
		const app = host();
		app.group('/g', (group) => group.plugin(guardedPlugin('/console/graphql')));
		expect(await status(app, '/api/g/console/graphql')).toBe(401);
		expect(await status(app, '/api/g/console/graphql', { who: 'admin' })).toBe(
			200,
		);
	});

	test('the same plugin mounted twice: each copy is left to the field guard', async () => {
		const app = host();
		const plugin = guardedPlugin('/graphql', '/console');
		app.group('/one', (group) => group.plugin(plugin));
		app.group('/two', (group) => group.plugin(plugin));
		for (const where of ['/api/one', '/api/two']) {
			expect(await status(app, `${where}/console/graphql`)).toBe(401);
			expect(
				await status(app, `${where}/console/graphql`, { who: 'admin' }),
			).toBe(200);
		}
	});

	test('a host without a guard: the endpoint stays refused (closed)', async () => {
		const app = alxia({ prefix: '/api' });
		app.plugin(guardedPlugin('/console/graphql'));
		expect(await status(app, ENDPOINT, { who: 'admin' })).toBe(403);
	});
});

describe('the placement lets nothing else through', () => {
	const mounted = (declare: (app: App) => void) => {
		const app = host();
		app.plugin(guardedPlugin('/console/graphql'));
		declare(app);
		return app;
	};

	test('a host REST route declared after the plugin at a longer path', async () => {
		const app = mounted((a) => a.post('/evil/console/graphql', ok));
		expect(
			await status(app, '/api/evil/console/graphql', { who: 'admin' }),
		).toBe(403);
	});

	test('a host REST route that extends the endpoint path', async () => {
		const app = mounted((a) => a.post('/console/graphqlx', ok));
		expect(await status(app, '/api/console/graphqlx', { who: 'admin' })).toBe(
			403,
		);
	});

	test('a host twin reusing the endpoint handler elsewhere', async () => {
		const app = mounted((a) => {
			const endpoint = a.routes.find((r) => r.path === ENDPOINT);
			a.post('/twin', endpoint?.handler as never);
		});
		expect(await status(app, '/api/twin', { who: 'admin' })).toBe(403);
	});

	test('a host route on the endpoint path under another method', async () => {
		const app = mounted((a) => {
			const endpoint = a.routes.find((r) => r.path === ENDPOINT);
			a.put('/console/graphql', endpoint?.handler as never);
		});
		expect(await status(app, ENDPOINT, { method: 'PUT', who: 'admin' })).toBe(
			403,
		);
	});

	test('a host HEAD route on the endpoint path', async () => {
		const app = mounted((a) => a.head('/console/graphql', ok));
		expect(await status(app, ENDPOINT, { method: 'HEAD', who: 'admin' })).toBe(
			403,
		);
	});

	test('a middleware between the guards that moves ctx.route', async () => {
		const app = host();
		const mover = defineMiddleware(async (_ctx, next) =>
			next({ route: '/api/evil/console/graphql' } as never),
		);
		app.use(mover);
		app.plugin(guardedPlugin('/console/graphql'));
		app.post('/evil/console/graphql', ok);
		expect(
			await status(app, '/api/evil/console/graphql', { who: 'admin' }),
		).toBe(403);
	});

	for (const path of [
		`${ENDPOINT}/`,
		'/api//console/graphql',
		'/api/console%2Fgraphql',
		'/evil/api/console/graphql',
	]) {
		test(`${path} never reaches a REST route with a 200`, async () => {
			const app = mounted((a) => a.post('/evil/console/graphql', ok));
			const answer = await status(app, path, { who: 'admin' });
			expect([401, 403, 404, 200]).toContain(answer);
			const body = await (await send(app, path, { who: 'admin' })).text();
			// 200 is only the field guard's answer to the endpoint itself.
			if (answer === 200) expect(body).toContain('stats');
		});
	}
});
