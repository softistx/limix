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
const guarded = new WeakSet<object>();

type Definition = RouteDefinition | SocketDefinition;

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

/**
 * Whether a request is left to a field guard, `isEndpoint` of the definition
 * that answers it (one `definitionOf` cannot find is judged: fail closed). The
 * answer is kept per method, route and upgrade for the standard methods only,
 * so a client inventing methods cannot grow it.
 */
export function endpointTest(
	app: RoutesOf,
): (method: string, route: string, upgrade: boolean) => boolean {
	const kept = new Map<string, boolean>();
	return (method, route, upgrade) => {
		const key = `${method} ${route} ${upgrade}`;
		const known = kept.get(key);
		if (known !== undefined) return known;
		const definition = definitionOf(app, method, route, upgrade);
		const found = definition !== undefined && isEndpoint(definition);
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
	if (guarded.has(app)) {
		throw new TypeError(
			'limixGuard(): this app already has a limix guard; one rule set guards one service. Put the guard on a group to keep it to part of the routes',
		);
	}
	guarded.add(app);
}
