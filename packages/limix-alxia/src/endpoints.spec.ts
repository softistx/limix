import { describe, expect, test } from 'bun:test';
import {
	alxia,
	defineMiddleware,
	type FreeReplyFunction,
} from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { whoOf } from './app.fixtures';
import {
	claimApp,
	definitionOf,
	isEndpoint,
	judgedLater,
	placedEndpoint,
	prefixOf,
	registerEndpoints,
} from './endpoints';
import { limixGuard } from './guard';

/** A handler of its own: the registry knows handlers by identity. */
const own =
	() =>
	({ reply }: { reply: FreeReplyFunction }) =>
		reply(200, {});

describe('endpoints registry', () => {
	test('a definition is an endpoint by its handler, so a copy of it is one too', () => {
		const app = alxia().get('/a', own()).get('/b', own());
		const [a, b] = app.routes;
		registerEndpoints([a as never], []);
		expect(isEndpoint(a as never)).toBe(true);
		expect(isEndpoint({ ...(a as object), path: '/moved' } as never)).toBe(
			true,
		);
		expect(isEndpoint(b as never)).toBe(false);
	});

	test('a socket is an endpoint by its handlers', () => {
		const app = alxia()
			.ws('/s', { message() {} })
			.ws('/t', { message() {} });
		const [s, t] = app.sockets;
		registerEndpoints([], [s as never]);
		expect(isEndpoint(s as never)).toBe(true);
		expect(isEndpoint(t as never)).toBe(false);
	});

	test('definitionOf finds the route of a method and a path, HEAD by its GET, ALL by any method', () => {
		const app = alxia()
			.get('/a', own())
			.post('/a', own())
			.all('/any', own())
			.ws('/s', { message() {} });
		const at = (method: string, path: string) =>
			definitionOf(app, method, path);
		expect(at('GET', '/a')).toBe(app.routes[0]);
		expect(at('POST', '/a')).toBe(app.routes[1]);
		expect(at('HEAD', '/a')).toBe(app.routes[0]);
		expect(at('PROPFIND', '/any')).toBe(app.routes[2]);
		expect(at('GET', '/s')).toBe(app.sockets[0]);
		expect(at('DELETE', '/a')).toBeUndefined();
		expect(at('GET', '/missing')).toBeUndefined();
	});

	test('one guard per app', () => {
		const app = alxia();
		claimApp(app);
		expect(() => claimApp(app)).toThrow(/already has a limix guard/);
	});
});

describe('judgedLater', () => {
	const rules = compilePolicy(
		definePolicy({ limix: 1, global: { unmatched: 'allow' } }),
	);
	const guardOn = (app: ReturnType<typeof alxia>) =>
		limixGuard({ policy: rules, claims: whoOf, app });

	function nested() {
		const outer = alxia();
		const outerGuard = guardOn(outer);
		outer.use(outerGuard);
		let inner: ReturnType<typeof alxia> | undefined;
		let innerGuard: unknown;
		outer.group('/g', (group) => {
			inner = group;
			innerGuard = guardOn(group);
			return group.use(innerGuard as never).get('/a', own());
		});
		const definition = outer.routes[0] as never;
		return { outer, outerGuard, inner, innerGuard, definition };
	}

	test('a later guard that owns the route judges it, the outer guard leaves it', () => {
		const { outerGuard, innerGuard, definition } = nested();
		expect(judgedLater(definition, outerGuard)).toBe(true);
		expect(judgedLater(definition, innerGuard)).toBe(false);
	});

	test('a later guard that does not own the route: the outer guard judges', () => {
		const outer = alxia();
		const outerGuard = guardOn(outer);
		outer.use(outerGuard);
		const stray = alxia();
		const strayGuard = guardOn(stray);
		outer.group('/g', (group) => group.use(strayGuard).get('/a', own()));
		expect(judgedLater(outer.routes[0] as never, outerGuard)).toBe(false);
	});

	test('a hook with a `when` is not a guard that runs for the request', () => {
		const { outerGuard, definition } = nested();
		const hook = (definition as { derive: object[] }).derive[1] as object;
		expect(judgedLater(definition, outerGuard)).toBe(true);
		Object.assign(hook, { when: '/g' });
		try {
			expect(judgedLater(definition, outerGuard)).toBe(false);
		} finally {
			Reflect.deleteProperty(hook, 'when');
		}
	});

	test('a chain without the asking guard is judged', () => {
		const { definition } = nested();
		expect(judgedLater(definition, () => undefined)).toBe(false);
	});

	test('a later middleware that is no registered guard is not a guard', () => {
		const outer = alxia();
		const outerGuard = guardOn(outer);
		outer.use(outerGuard);
		const plain = defineMiddleware(async (_ctx, next) => next());
		outer.group('/g', (group) => group.use(plain).get('/a', own()));
		expect(judgedLater(outer.routes[0] as never, outerGuard)).toBe(false);
	});
});

describe('placedEndpoint', () => {
	const rules = compilePolicy(
		definePolicy({ limix: 1, global: { unmatched: 'allow' } }),
	);
	const guardOn = (app: ReturnType<typeof alxia>) =>
		limixGuard({ policy: rules, claims: whoOf, app });

	/** A plugin with a guard and one registered endpoint at `/console/graphql`, mounted under `/api`. */
	function mounted() {
		const plugin = alxia();
		const pluginGuard = guardOn(plugin);
		plugin.use(pluginGuard);
		plugin.post('/console/graphql', own());
		registerEndpoints(plugin.routes as never, []);
		const host = alxia({ prefix: '/api' });
		const hostGuard = guardOn(host);
		host.use(hostGuard);
		host.plugin(plugin);
		const copy = host.routes.find(
			(r) => r.path === '/api/console/graphql',
		) as never;
		const placement = { route: '/api/console/graphql', definition: copy };
		return { plugin, pluginGuard, host, hostGuard, copy, placement };
	}
	const check = (
		m: ReturnType<typeof mounted>,
		over: Partial<{
			self: unknown;
			method: string;
			route: string;
			upgrade: boolean;
			placement: { route: string; definition: never } | undefined;
		}> = {},
	) =>
		placedEndpoint(
			m.plugin,
			'self' in over ? over.self : m.pluginGuard,
			over.method ?? 'POST',
			over.route ?? '/api/console/graphql',
			over.upgrade ?? false,
			'placement' in over ? over.placement : m.placement,
		);

	test('a real mounted copy is left to the field guard', () => {
		expect(check(mounted())).toBe(true);
	});

	test('no placement: judged', () => {
		expect(check(mounted(), { placement: undefined })).toBe(false);
	});

	test('a route that differs from the placed one: judged', () => {
		expect(check(mounted(), { route: '/api/console/graphqlx' })).toBe(false);
	});

	test('a placed definition that is no endpoint: judged', () => {
		const m = mounted();
		const other = alxia({ prefix: '/api' }).post('/console/graphql', own());
		const definition = other.routes[0] as never;
		expect(
			check(m, { placement: { route: '/api/console/graphql', definition } }),
		).toBe(false);
	});

	test('a method other than the placed one: judged', () => {
		const m = mounted();
		expect(check(m, { method: 'PUT' })).toBe(false);
		expect(check(m, { method: 'HEAD' })).toBe(false);
	});

	test('a placed copy of another schema: judged', () => {
		const m = mounted();
		const definition = { ...(m.copy as object), schema: {} } as never;
		expect(
			check(m, { placement: { route: m.placement.route, definition } }),
		).toBe(false);
	});

	test('a hook of another guard is not the plugin guard: judged', () => {
		const m = mounted();
		expect(check(m, { self: m.hostGuard })).toBe(false);
	});

	test('a copy whose chain lost the plugin guard hook: judged', () => {
		const m = mounted();
		const definition = {
			...(m.copy as object),
			derive: [],
		} as never;
		expect(
			check(m, { placement: { route: m.placement.route, definition } }),
		).toBe(false);
	});
});

describe('prefixOf', () => {
	test('the prefix a mount put before a path', () => {
		expect(prefixOf('/api/graphql', '/graphql')).toBe('/api');
		expect(prefixOf('/api', '/')).toBe('/api');
		expect(prefixOf('/graphql', '/graphql')).toBe('');
	});

	test('a path that is not a mount of the other', () => {
		expect(prefixOf('/apigraphql', '/graphql')).toBeUndefined();
		expect(prefixOf('//graphql', '/graphql')).toBeUndefined();
		expect(prefixOf('/a//b/graphql', '/graphql')).toBeUndefined();
		expect(prefixOf('/graphql', '/other')).toBeUndefined();
	});
});
