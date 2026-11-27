import type { RouteDefinition, SocketDefinition } from '@softistx/alxia';
import type { RoutesOf } from './options';

/**
 * What `limixGraphql` declared, so the guard leaves it to the field guard and
 * `alxiaOperations` leaves it out of the REST list. Told apart by the handler
 * (a route's `handler`, a socket's `handlers`): a plugin or a group mounting
 * the app copies the definition and keeps the handler, so the copy is still
 * known, and a REST route that merely shares the path is not.
 */
const handlers = new WeakSet<object>();
/** The guard (its middleware) each app took, and the app each guard was given. */
const guardOfApp = new WeakMap<object, unknown>();
const appOfGuard = new WeakMap<object, RoutesOf>();

type Definition = RouteDefinition | SocketDefinition;
type ChainHook = Definition['derive'][number];

const handlerOf = (definition: Definition): object =>
	'handler' in definition ? definition.handler : definition.handlers;

/** Records the routes and sockets one `limixGraphql` call declared. */
export function registerEndpoints(
	routes: readonly RouteDefinition[],
	sockets: readonly SocketDefinition[],
): void {
	for (const definition of [...routes, ...sockets]) {
		handlers.add(handlerOf(definition));
	}
}

/** Whether `limixGraphql` declared this route or socket (or what a plugin or group made of it). */
export const isEndpoint = (definition: Definition): boolean =>
	handlers.has(handlerOf(definition));

/**
 * The definition of `app` that answers `method` at the declared path `route`
 * (what `ctx.route` holds), as alxia's own `route()` picks it: the socket a
 * websocket `upgrade` asks for first, then the route of that method, a HEAD's
 * GET, an `all` route, and last the socket a plain GET reaches (its 426).
 * `undefined` when `app` holds none.
 */
export function definitionOf(
	app: RoutesOf,
	method: string,
	route: string,
	upgrade = false,
): Definition | undefined {
	const socket = app.sockets?.find((candidate) => candidate.path === route);
	if (upgrade && socket) return socket;
	const here = app.routes.filter((candidate) => candidate.path === route);
	const named = (name: string) => here.find((c) => c.method === name);
	return (
		named(method) ??
		(method === 'HEAD' ? named('GET') : undefined) ??
		named('ALL') ??
		(method === 'GET' || method === 'HEAD' ? socket : undefined)
	);
}

const label = (definition: Definition): string =>
	'handler' in definition
		? `${definition.method} ${definition.path}`
		: `WS ${definition.path}`;

const KNOWN = new Set([
	'GET',
	'HEAD',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'OPTIONS',
	'QUERY',
]);

/** Records that `middleware` is the guard of `app`, so an outer guard can tell it from any other middleware. */
export function registerGuard(app: RoutesOf, middleware: object): void {
	guardOfApp.set(app, middleware);
	appOfGuard.set(middleware, app);
}

const sameKind = (a: Definition, b: Definition): boolean =>
	'handler' in a ? 'handler' in b && a.method === b.method : !('handler' in b);

const isMiddleware = (hook: ChainHook, run: unknown): boolean =>
	hook.kind === 'middleware' && (hook.run as unknown) === run;

/**
 * Whether `definition` was declared behind the registered guard `later`: the
 * app `later` was given holds the definition itself, or the one a mount copied
 * (same handler, kind, method, schema and exact path), and that definition's
 * chain holds `later`. A route a prefixless plugin's guard merely leaked onto
 * owns nothing of that guard.
 */
function ownedBy(definition: Definition, later: unknown): boolean {
	if (typeof later !== 'function') return false;
	const app = appOfGuard.get(later);
	if (app === undefined) return false;
	return [...app.routes, ...(app.sockets ?? [])].some(
		(d) =>
			(d === definition ||
				(handlerOf(d) === handlerOf(definition) &&
					sameKind(d, definition) &&
					d.schema === definition.schema)) &&
			definition.path === d.path &&
			d.derive.some((hook) => isMiddleware(hook, later)),
	);
}

/**
 * Whether the matched definition `definition`, reached through the guard `self`,
 * is left to a guard that runs right after it, which alone judges it. All of
 * this holds, each checked on the definition itself: (1) the very next hook of
 * its chain after `self` is a middleware with no `when` that is another
 * registered limix guard `later` (a hook of any kind between them, a cache that
 * answers for one, and both guards judge); (2) the app `later` was given
 * declares this route (`ownedBy`); (3) that definition's chain holds `later`.
 * Otherwise `self` judges: fail closed.
 */
export function judgedLater(definition: Definition, self: unknown): boolean {
	const chain = definition.derive;
	const at = chain.findIndex((hook) => isMiddleware(hook, self));
	const next = at < 0 ? undefined : chain[at + 1];
	if (next === undefined || next.kind !== 'middleware') return false;
	if (next.when !== undefined || (next.run as unknown) === self) return false;
	return ownedBy(definition, next.run);
}

/**
 * The routes and sockets of `app` that a registered guard of the chain owns
 * after `self` but not right after it: a hook stands between, so both guards
 * judge the route.
 */
export function separatedGuards(app: RoutesOf, self: unknown): string[] {
	return [...app.routes, ...(app.sockets ?? [])]
		.filter((definition) => {
			const chain = definition.derive;
			const at = chain.findIndex((hook) => isMiddleware(hook, self));
			return (
				at >= 0 &&
				!judgedLater(definition, self) &&
				chain
					.slice(at + 1)
					.some(
						(hook) =>
							hook.kind === 'middleware' &&
							hook.when === undefined &&
							(hook.run as unknown) !== self &&
							ownedBy(definition, hook.run),
					)
			);
		})
		.map(label);
}

/** Whether a guard of a group or plugin judges `definition` of `app` instead of the guard of `app`. */
export function judgedElsewhere(
	app: RoutesOf,
	definition: Definition,
): boolean {
	const self = guardOfApp.get(app);
	return self !== undefined && judgedLater(definition, self);
}

/**
 * Whether a request is not judged by this guard: left to a field guard
 * (`isEndpoint` of the definition that answers it) or to the guard of a group
 * or plugin that owns the route (`judgedLater`). A definition `definitionOf`
 * cannot find is judged: fail closed. The answer is kept per method, route and
 * upgrade for the standard methods only, so a client inventing methods cannot
 * grow it.
 */
export function skipTest(
	app: RoutesOf,
	self: () => unknown,
): (method: string, route: string, upgrade: boolean) => boolean {
	const kept = new Map<string, boolean>();
	return (method, route, upgrade) => {
		const key = `${method} ${route} ${upgrade}`;
		const known = kept.get(key);
		if (known !== undefined) return known;
		const definition = definitionOf(app, method, route, upgrade);
		const found =
			definition !== undefined &&
			(isEndpoint(definition) || judgedLater(definition, self()));
		if (KNOWN.has(method)) kept.set(key, found);
		return found;
	};
}

/** What `app` already declares that is not a `limixGraphql` endpoint: `METHOD path`, `WS path`. */
export function declaredRoutes(app: RoutesOf): string[] {
	return [...app.routes, ...(app.sockets ?? [])]
		.filter((definition) => !isEndpoint(definition))
		.map(label);
}

/**
 * The routes and sockets of `app` (a `limixGraphql` endpoint aside) whose chain
 * does not hold the guard `middleware`: declared before its `use()`, or outside
 * the scope it was used in. They would run without the rules.
 */
export function unguardedRoutes(app: RoutesOf, middleware: unknown): string[] {
	return [...app.routes, ...(app.sockets ?? [])]
		.filter(
			(definition) =>
				!isEndpoint(definition) &&
				!definition.derive.some(
					(hook) => 'run' in hook && (hook.run as unknown) === middleware,
				),
		)
		.map(label);
}

/** One rule set per service: a second guard on the same app is a mistake. */
export function claimApp(app: object): void {
	if (guardOfApp.has(app)) {
		throw new TypeError(
			'limixGuard(): this app already has a limix guard; one rule set guards one service. Put the guard on a group to keep it to part of the routes',
		);
	}
	guardOfApp.set(app, undefined);
}
