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
		const [outerHook, innerHook] = (definition as { derive: object[] }).derive;
		const scoped = {
			...(definition as object),
			derive: [outerHook, { ...innerHook, when: '/g' }],
		} as never;
		expect(judgedLater(scoped, outerGuard)).toBe(false);
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
