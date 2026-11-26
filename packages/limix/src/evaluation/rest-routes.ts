import type { CompiledPolicy, CompiledRestRoute } from '../rules';

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
	/** What the pattern captured from the path; empty for a pre-matched route. */
	params: Partial<Record<string, string | string[]>>;
}

/**
 * The first route of `routes` that fits, in document order: the one whose
 * pattern is `route` (an already-matched route, written as in the rules file,
 * with or without the `global.basePath`), else, when `route` misses or is not
 * given, the first whose matcher takes `path`. A `route` that is not spelled as
 * in the rules file therefore falls back to `path` rather than to `unmatched`.
 */
export function findRoute(
	routes: readonly CompiledRestRoute[],
	where: { route?: string | undefined; path?: string | undefined },
	basePath: string | undefined,
): RouteMatch | undefined {
	const { route: pattern, path } = where;
	if (pattern !== undefined) {
		const route = routes.find(
			(candidate) =>
				candidate.pattern === pattern ||
				candidate.pattern === `${basePath ?? ''}${pattern}`,
		);
		if (route) return { route, params: {} };
	}
	for (const route of routes) {
		const result = path === undefined ? false : route.matcher(path);
		if (result !== false) return { route, params: result.params };
	}
	return undefined;
}
