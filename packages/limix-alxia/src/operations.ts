import type { RestOperation } from '@softistx/limix/coverage';
import { isEndpoint } from './endpoints';
import type { RoutesOf } from './options';
import { limixPath } from './path';

/** The methods an `all` route takes when its path declares no route of its own for them. */
const ALL_METHODS = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'OPTIONS',
	'QUERY',
];

/**
 * The REST operations of an app or group, in the shape `coverage(policy, operations)`
 * of `@softistx/limix/coverage` takes: each route with the pattern spelling of the
 * rules file, `all` expanded to the methods it takes, each socket as the `GET` that
 * upgrades it, and the `HEAD` every `GET` answers. The endpoints `limixGraphql`
 * declared are left out: their fields are listed by `graphqlOperations`. An
 * `all` route also takes methods such as `PROPFIND` that no list can name: the
 * guard judges them, and coverage cannot, so they fall under `unmatched`.
 */
export function alxiaOperations(app: RoutesOf): RestOperation[] {
	const operations = new Map<string, RestOperation>();
	const add = (method: string, path: string) => {
		const pattern = limixPath(path);
		operations.set(`${method} ${pattern}`, {
			kind: 'rest',
			method,
			path: pattern,
		});
	};
	const declaredAt = (path: string): ReadonlySet<string> =>
		new Set(
			app.routes
				.filter((route) => route.path === path && route.method !== 'ALL')
				.map((route) => route.method),
		);
	for (const route of app.routes) {
		if (isEndpoint(route)) continue;
		if (route.method === 'ALL') {
			const own = declaredAt(route.path);
			for (const method of ALL_METHODS) {
				if (!own.has(method)) add(method, route.path);
			}
		} else {
			add(route.method, route.path);
		}
	}
	for (const socket of app.sockets ?? []) {
		if (!isEndpoint(socket)) add('GET', socket.path);
	}
	for (const operation of [...operations.values()]) {
		if (operation.method !== 'GET') continue;
		const key = `HEAD ${operation.path}`;
		if (!operations.has(key)) {
			operations.set(key, { ...operation, method: 'HEAD' });
		}
	}
	return [...operations.values()];
}
