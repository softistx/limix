import type { CompiledPolicy, CompiledRestRoute } from '../rules';
import { opensPattern, parsePattern } from '../rules/compile/pattern';

/**
 * The rule sets a request with this method must pass. Every method faces its
 * own routes, except HEAD: a server answers it by running the GET route, so
 * HEAD faces its own rules and then the GET ones, and both must allow. The
 * last set is the handler's, and the only one that falls back to
 * `global.unmatched`.
 */
export function ruleSetsForMethod(
	policy: CompiledPolicy,
	method: string,
): readonly (readonly CompiledRestRoute[])[] {
	const own = policy.restRoutesByMethod.get(method) ?? [];
	if (method !== 'HEAD') return [own];
	return [own, policy.restRoutesByMethod.get('GET') ?? []];
}

export interface RouteMatch {
	route: CompiledRestRoute;
	/**
	 * What the pattern captured: from `path` when it is given, from a `route`
	 * written as plain text; empty for a `route` that is itself a pattern.
	 */
	params: Partial<Record<string, string | string[]>>;
	/** `true` when `route` named the pattern itself, `false` when a matcher took the input. */
	exact: boolean;
}

/**
 * The first route of `routes` that fits, in one walk in document order. A
 * candidate fits when its pattern is `route` (an already-matched route, written
 * as in the rules file, with or without the `global.basePath`), or when its
 * matcher takes `path`. With no `path`, the matcher is tried on `route`
 * instead (with and without the basePath), so an earlier pattern that takes
 * the route wins over a later one that names it, as it does for a `path`. A
 * `route` that opens (a wildcard, or an optional group holding a parameter)
 * is matched by its own spelling only: a matcher may take just some of the
 * paths it stands for.
 *
 * Params are those the matcher captured from `path`, or from a `route` of
 * plain text; a `route` that is a pattern captures none.
 */
export function findRoute(
	routes: readonly CompiledRestRoute[],
	where: { route?: string | undefined; path?: string | undefined },
	basePath: string | undefined,
): RouteMatch | undefined {
	const route = typeof where.route === 'string' ? where.route : undefined;
	const path = typeof where.path === 'string' ? where.path : undefined;
	const named = route === undefined ? [] : [route, `${basePath ?? ''}${route}`];
	const probes =
		path !== undefined
			? [path]
			: route !== undefined && !leavesPartlyOpen(route)
				? basePath
					? [route, `${basePath}${route}`]
					: [route]
				: [];
	const captures =
		path !== undefined || (route !== undefined && isLiteral(route));
	for (const candidate of routes) {
		if (named.includes(candidate.pattern)) {
			return { route: candidate, params: {}, exact: true };
		}
		for (const probe of probes) {
			const result = candidate.matcher(probe);
			if (result !== false) {
				return {
					route: candidate,
					params: captures ? result.params : {},
					exact: false,
				};
			}
		}
	}
	return undefined;
}

/**
 * Whether the route stands for more than one segment shape, as
 * `opensPattern` reads it; a route that does not parse is left to the matcher.
 */
export function leavesPartlyOpen(route: string): boolean {
	try {
		return opensPattern(parsePattern(route));
	} catch {
		return false;
	}
}

/** Whether the route is plain text: no parameter, wildcard or group. A route that does not parse is. */
function isLiteral(route: string): boolean {
	try {
		return parsePattern(route).every((token) => token.type === 'text');
	} catch {
		return true;
	}
}
