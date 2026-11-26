import { parse, type Token } from 'path-to-regexp';
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
 * Whether the operation path stands for more than one segment shape: a
 * wildcard, or an optional group that holds a parameter or a wildcard. A group
 * of plain text (an OpenAPI `{id}` brace) names one spelling and is left to the
 * matcher, as `rulesPathOf` documents.
 */
function leavesPartlyOpen(path: string): boolean {
	try {
		return opens(parse(path).tokens);
	} catch {
		return false;
	}
}

function opens(tokens: readonly Token[]): boolean {
	return tokens.some((token) =>
		token.type === 'wildcard'
			? true
			: token.type === 'group'
				? token.tokens.some((inner) => inner.type !== 'text') ||
					opens(token.tokens)
				: false,
	);
}
