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
 * (what `ctx.route` holds): the route of that method, a HEAD's GET, an `all`
 * route, or the socket a GET upgrades. `undefined` when `app` holds none.
 */
export function definitionOf(
	app: RoutesOf,
	method: string,
	route: string,
): Definition | undefined {
	const here = app.routes.filter((candidate) => candidate.path === route);
	const named = (name: string) => here.find((c) => c.method === name);
	return (
		named(method) ??
		(method === 'HEAD' ? named('GET') : undefined) ??
		named('ALL') ??
		(method === 'GET' || method === 'HEAD'
			? app.sockets?.find((socket) => socket.path === route)
			: undefined)
	);
}

/** What `app` already declares that is not a `limixGraphql` endpoint: `METHOD path`, `WS path`. */
export function declaredRoutes(app: RoutesOf): string[] {
	return [
		...app.routes
			.filter((route) => !isEndpoint(route))
			.map((route) => `${route.method} ${route.path}`),
		...(app.sockets ?? [])
			.filter((socket) => !isEndpoint(socket))
			.map((socket) => `WS ${socket.path}`),
	];
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
