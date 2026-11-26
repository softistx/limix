import { findRoute } from '../evaluation/rest-routes';
import type { CompiledRestRoute } from '../rules';

export interface OperationRoute {
	route: CompiledRestRoute;
	/** `exact`: the rule's own pattern. `pattern`: its matcher took the path. */
	match: 'exact' | 'pattern';
}

/**
 * The route `evaluateRest` would pick for an operation, found through the same
 * `findRoute`: the exact pattern first, then the matcher on the path, each
 * with the path as given and behind `global.basePath`. The operation path
 * stands for both the `route` and the `path` of a request.
 */
export function findOperationRoute(
	routes: readonly CompiledRestRoute[],
	path: string,
	basePath: string | undefined,
): OperationRoute | undefined {
	const hit =
		findRoute(routes, { route: path, path }, basePath) ??
		(basePath
			? findRoute(routes, { path: `${basePath}${path}` }, basePath)
			: undefined);
	return hit && { route: hit.route, match: hit.exact ? 'exact' : 'pattern' };
}
