import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
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
		definePolicy({
			limix: 1,
			global: { unmatched },
			rest,
			graphql,
		} as never),
	);
const outerRules = (unmatched: 'deny' | 'allow', health = '/health') =>
	rules(
		unmatched,
		{ Query: { me: { public: true } } },
		{ [health]: { GET: { public: true } } },
	);
const consoleRules = rules(
	'deny',
	{ Query: { stats: { roles: [['admin']] } } },
	{},
);

const post = (app: App, path: string, source: string, who?: string) =>
	Promise.resolve(
		app.fetch(
			new Request(`http://localhost${path}`, {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(who ? { 'x-who': who } : {}),
				},
				body: JSON.stringify({ query: source }),
			}),
		),
	);

const optionsOf = (policy: Options['policy'], app: object): Options => ({
	policy,
	claims: whoOf,
	app: app as never,
});

/** The outer app: its guard, `/health` and its own endpoint at `/graphql`. */
function outerApp(unmatched: 'deny' | 'allow', prefix = '') {
	const app = alxia(prefix === '' ? {} : { prefix: prefix as `/${string}` });
	const limix = optionsOf(outerRules(unmatched, `${prefix}/health`), app);
	app.use(limixGuard(limix));
	app.get('/health', ok);
	limixGraphql(app, { schema: outerSchema(), limix });
	return app;
}

for (const unmatched of ['deny', 'allow'] as const) {
	describe(`two schemas, outer unmatched: ${unmatched}`, () => {
		test('a group with its own guard and endpoint: each endpoint is judged by its own field rules', async () => {
			const app = outerApp(unmatched);
			app.group('/console', (group) => {
				const limix = optionsOf(consoleRules, group);
				group.use(limixGuard(limix));
				return limixGraphql(group, {
					schema: consoleSchema(),
					limix,
					path: '/graphql',
				});
			});
			expect(await (await post(app, '/graphql', '{ me }')).json()).toEqual({
				data: { me: 'me' },
			});
			expect((await post(app, '/console/graphql', '{ stats }')).status).toBe(
				401,
			);
			const admin = await post(app, '/console/graphql', '{ stats }', 'admin');
			expect(admin.status).toBe(200);
			expect(await admin.json()).toEqual({ data: { stats: 'stats' } });
		});

		test('the outer REST rules never judge the inner endpoint', async () => {
			const app = outerApp(unmatched);
			app.group('/console', (group) => {
				const limix = optionsOf(consoleRules, group);
				group.use(limixGuard(limix));
				return limixGraphql(group, {
					schema: consoleSchema(),
					limix,
					path: '/graphql',
				});
			});
			// Under deny the outer file names no /console/graphql: an outer judgement would be 403.
			const res = await post(app, '/console/graphql', '{ stats }', 'admin');
			expect(res.status).toBe(200);
		});

		test('the inner endpoint without an inner guard is judged by its own field rules, never open', async () => {
			const app = outerApp(unmatched);
			app.group('/console', (group) =>
				limixGraphql(group, {
					schema: consoleSchema(),
					limix: optionsOf(consoleRules, group),
					path: '/graphql',
				}),
			);
			expect((await post(app, '/console/graphql', '{ stats }')).status).toBe(
				401,
			);
			expect(
				(await post(app, '/console/graphql', '{ stats }', 'admin')).status,
			).toBe(200);
		});

		test('an unruled field of the inner schema is refused', async () => {
			const app = outerApp(unmatched);
			app.group('/console', (group) => {
				const limix = optionsOf(rules('deny', { Query: {} }, {}), group);
				group.use(limixGuard(limix));
				return limixGraphql(group, {
					schema: consoleSchema(),
					limix,
					path: '/graphql',
				});
			});
			expect(
				(await post(app, '/console/graphql', '{ stats }', 'admin')).status,
			).toBe(403);
		});

		for (const prefix of ['', '/console'] as const) {
			test(`a plugin with ${prefix === '' ? 'no prefix' : `prefix ${prefix}`}, its guard and its endpoint: the same answers`, async () => {
				const app = outerApp(unmatched);
				const plugin = alxia(prefix === '' ? {} : { prefix });
				const limix = optionsOf(consoleRules, plugin);
				plugin.use(limixGuard(limix));
				limixGraphql(plugin, {
					schema: consoleSchema(),
					limix,
					path: prefix === '' ? '/console/graphql' : '/graphql',
				});
				app.plugin(plugin);
				expect((await post(app, '/console/graphql', '{ stats }')).status).toBe(
					401,
				);
				expect(
					(await post(app, '/console/graphql', '{ stats }', 'admin')).status,
				).toBe(200);
				expect((await post(app, '/graphql', '{ me }')).status).toBe(200);
			});
		}

		test('a host prefix with a group: the same answers', async () => {
			const app = outerApp(unmatched, '/api');
			app.group('/console', (group) => {
				const limix = optionsOf(consoleRules, group);
				group.use(limixGuard(limix));
				return limixGraphql(group, {
					schema: consoleSchema(),
					limix,
					path: '/graphql',
				});
			});
			expect((await post(app, '/api/graphql', '{ me }')).status).toBe(200);
			expect(
				(await post(app, '/api/console/graphql', '{ stats }')).status,
			).toBe(401);
			expect(
				(await post(app, '/api/console/graphql', '{ stats }', 'admin')).status,
			).toBe(200);
		});
	});
}

for (const unmatched of ['deny', 'allow'] as const) {
	describe(`a plugin with its own guard under a host prefix, outer unmatched: ${unmatched}`, () => {
		test('its endpoint is judged by its own field rules', async () => {
			const app = outerApp(unmatched, '/api');
			const plugin = alxia();
			const limix = optionsOf(consoleRules, plugin);
			plugin.use(limixGuard(limix));
			limixGraphql(plugin, {
				schema: consoleSchema(),
				limix,
				path: '/console/graphql',
			});
			app.plugin(plugin);
			expect(
				(await post(app, '/api/console/graphql', '{ stats }')).status,
			).toBe(401);
			expect(
				(await post(app, '/api/console/graphql', '{ stats }', 'admin')).status,
			).toBe(200);
			expect((await post(app, '/api/graphql', '{ me }')).status).toBe(200);
		});
	});
}
