import { findRoute } from '../evaluation/rest-routes';
import type { CompiledRestRoute } from '../rules';

export interface OperationRoute {
	route: CompiledRestRoute;
	/**
	 * `exact`: the rule's own pattern. `pattern`: an earlier rule's matcher took
	 * the path (or this rule's own, for a spelling it does not share).
	 */
	match: 'exact' | 'pattern';
}

/**
 * The route `evaluateRest` would pick for an operation, found through the same
 * `findRoute`: one walk in document order, the operation read as an
 * already-matched route (with and without `global.basePath`), so the rule a
 * request to it meets is the first whose pattern is the operation or whose
 * matcher takes it.
 *
 * A matcher hit is refused for an operation path holding a wildcard (`*name`)
 * or an optional group that holds a parameter (`{/:id}`): a matcher may take
 * only some of the request paths that operation stands for, so coverage cannot
 * claim it.
 */
export function findOperationRoute(
	routes: readonly CompiledRestRoute[],
	path: string,
	basePath: string | undefined,
): OperationRoute | undefined {
	const hit = findRoute(routes, { route: path }, basePath);
	return hit && { route: hit.route, match: hit.exact ? 'exact' : 'pattern' };
}
