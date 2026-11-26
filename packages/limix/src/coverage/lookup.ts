import { findRoute } from '../evaluation/rest-routes';
import type { CompiledRestRoute } from '../rules';
import { opensPattern, parsePattern } from '../rules/compile/pattern';

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
 *
 * A matcher hit is refused for an operation path holding a wildcard (`*name`)
 * or an optional group that holds a parameter (`{/:id}`): the rule's matcher may take only some of the
 * request paths that operation stands for, so coverage cannot claim it.
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
	if (hit && !hit.exact && leavesPartlyOpen(path)) return undefined;
	return hit && { route: hit.route, match: hit.exact ? 'exact' : 'pattern' };
}

/**
 * Whether the operation path stands for more than one segment shape, as
 * `opensPattern` reads it; a path that does not parse is left to the matcher.
 */
function leavesPartlyOpen(path: string): boolean {
	try {
		return opensPattern(parsePattern(path));
	} catch {
		return false;
	}
}
