import { findRoute } from '../evaluation/rest-routes';
import type { CompiledRestRoute } from '../rules';

export interface OperationRoute {
	route: CompiledRestRoute;
	/**
	 * `exact`: the rule's own pattern. `pattern`: an earlier rule's matcher took
	 * the path (or this rule's own, for a spelling it does not share).
	 * `wildcard`: the rule is for method `*`, whichever way the path was found.
	 */
	match: 'exact' | 'pattern' | 'wildcard';
}

/**
 * The route `evaluateRest` would pick for an operation, found through the same
 * `findRoute`: one walk in document order, the operation read as an
 * already-matched route (with and without `global.basePath`), so the rule a
 * request to it meets is the first whose pattern is the operation or whose
 * matcher takes it.
 *
 * A whole-segment brace (`/docs/{id}`) is read as a parameter only when the
 * limix reading finds no rule: `evaluateRest` never reads it so.
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
	// A plain-text group is optional, as the matcher reads it. Only when that
	// finds no rule is a whole-segment brace (`/docs/{id}`, an OpenAPI spelling)
	// read as a parameter, so a rule a request could reach never hides behind it.
	const hit =
		findRoute(routes, { route: path }, basePath) ??
		findRoute(routes, { route: path }, basePath, true);
	if (!hit) return undefined;
	const match =
		hit.route.method === '*' ? 'wildcard' : hit.exact ? 'exact' : 'pattern';
	return { route: hit.route, match };
}
