import type { RouteDefinition, SocketDefinition } from '@softistx/alxia';

/**
 * What `limixGraphql` declared, so the guard leaves it to the field guard and
 * `alxiaOperations` leaves it out of the REST list. Keyed by object identity:
 * no global name, and nothing kept alive past its app.
 */
const keysByOptions = new WeakMap<object, Set<string>>();
const declared = new WeakSet<object>();
const guarded = new WeakSet<object>();

/** `METHOD path`, with HEAD read as the GET that answers it. */
const keyOf = (method: string, path: string) =>
	`${method === 'HEAD' ? 'GET' : method} ${path}`;

/** Records the routes and sockets one `limixGraphql` call declared, for the guard built from `options`. */
export function registerEndpoints(
	options: object,
	routes: readonly RouteDefinition[],
	sockets: readonly SocketDefinition[],
): void {
	const keys = keysByOptions.get(options) ?? new Set<string>();
	for (const route of routes) {
		declared.add(route);
		if (route.method === 'ALL') continue;
		keys.add(keyOf(route.method, route.path));
	}
	for (const socket of sockets) {
		declared.add(socket);
		keys.add(keyOf('GET', socket.path));
	}
	keysByOptions.set(options, keys);
}

/** Whether `limixGraphql(app, { limix: options })` declared this route: the field guard answers it, not the REST rules. */
export function isEndpointOf(
	options: object,
	method: string,
	route: string,
): boolean {
	return keysByOptions.get(options)?.has(keyOf(method, route)) === true;
}

/** Whether `limixGraphql` declared this route or socket. */
export const isEndpoint = (definition: RouteDefinition | SocketDefinition) =>
	declared.has(definition);

/** One rule set per service: a second guard on the same app is a mistake. */
export function claimApp(app: object): void {
	if (guarded.has(app)) {
		throw new TypeError(
			'limixGuard(): this app already has a limix guard; one rule set guards one service. Put the guard on a group to keep it to part of the routes',
		);
	}
	guarded.add(app);
}
