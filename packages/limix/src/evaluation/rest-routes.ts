import type { CompiledPolicy, CompiledRestRoute } from '../rules';
import type { MatchResult } from '../rules/compile/matcher';
import {
	opensPattern,
	type PatternToken,
	parsePattern,
} from '../rules/compile/pattern';

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
 * What stands for a route's parameter when a matcher is asked about the route:
 * a segment no rule literal can hold (a NUL character; a candidate whose
 * pattern holds one is never taken).
 */
const SENTINEL = '\u0000';
const MAX_STAND_INS = 64;

/**
 * The first route of `routes` that fits, in one walk in document order. A
 * candidate fits when its pattern is `route` (an already-matched route, written
 * as in the rules file, with or without the `global.basePath`), or when its
 * matcher takes `path`. With no `path`, the route is matched through stand-in
 * paths (see `standInsOf`): a candidate takes it only if its matcher takes every
 * alternative, with and without the basePath, so an earlier pattern that takes
 * the whole route wins over a later one that names it, as it does for a `path`.
 * A `route` that opens (a wildcard, or an optional group holding a parameter)
 * is matched by its own spelling only: a matcher may take just some of the
 * paths it stands for.
 *
 * Params are those the matcher captured from `path`, or from a `route` of
 * plain text (escapes written out); any other `route` captures none.
 */
export function findRoute(
	routes: readonly CompiledRestRoute[],
	where: { route?: string | undefined; path?: string | undefined },
	basePath: string | undefined,
): RouteMatch | undefined {
	const route = typeof where.route === 'string' ? where.route : undefined;
	const path = typeof where.path === 'string' ? where.path : undefined;
	if (route === undefined) {
		if (path === undefined) return undefined;
		for (const candidate of routes) {
			const result = candidate.matcher(path);
			if (result !== false) {
				return { route: candidate, params: result.params, exact: false };
			}
		}
		return undefined;
	}
	const based = `${basePath ?? ''}${route}`;
	const standIns = path === undefined ? standInsOf(route) : undefined;
	const basedStandIns =
		standIns && basePath ? standIns.map((s) => basePath + s) : undefined;
	const captures = path !== undefined || isLiteral(route);
	for (const candidate of routes) {
		if (candidate.pattern === route || candidate.pattern === based) {
			return { route: candidate, params: {}, exact: true };
		}
		const result =
			path !== undefined
				? candidate.matcher(path)
				: standIns &&
					(takesAll(candidate, standIns) ||
						(basedStandIns !== undefined &&
							takesAll(candidate, basedStandIns)));
		if (result) {
			return {
				route: candidate,
				params: captures ? result.params : {},
				exact: false,
			};
		}
	}
	return undefined;
}

/**
 * The paths a route stands for when it is matched without a request path: its
 * text written out unescaped, each parameter a sentinel segment, each optional
 * group both with and without. `undefined` for a route that opens (a wildcard,
 * or an optional group holding a parameter), for too many alternatives, and
 * for one that does not parse: such a route is matched by its own spelling
 * only, except an unparsable one, which stands for itself.
 */
export function standInsOf(route: string): string[] | undefined {
	let tokens: PatternToken[];
	try {
		tokens = parsePattern(route);
	} catch {
		return [route];
	}
	if (opensPattern(tokens)) return undefined;
	const render = (
		list: readonly PatternToken[],
		prefix: string[],
	): string[] => {
		let out = prefix;
		for (const [index, token] of list.entries()) {
			if (token.type === 'group' && !isBrace(list, index)) {
				out = [...out, ...render(token.tokens, out)];
			} else {
				const text = token.type === 'text' ? token.value : SENTINEL;
				out = out.map((alt) => alt + text);
			}
			if (out.length > MAX_STAND_INS) return out;
		}
		return out;
	};
	const alternatives = render(tokens, ['']);
	return alternatives.length > MAX_STAND_INS
		? undefined
		: [...new Set(alternatives)];
}

/**
 * An OpenAPI brace: a group of plain text holding no `/` that fills a whole
 * segment (`/docs/{id}`), which stands for one parameter, not for an optional
 * spelling. A group inside a segment (`/a{b}`) stays optional.
 */
function isBrace(list: readonly PatternToken[], index: number): boolean {
	const token = list[index];
	if (token?.type !== 'group') return false;
	if (!token.tokens.every((t) => t.type === 'text' && !t.value.includes('/'))) {
		return false;
	}
	const before = list[index - 1];
	const after = list[index + 1];
	return (
		before?.type === 'text' &&
		before.value.endsWith('/') &&
		(after === undefined ||
			(after.type === 'text' && after.value.startsWith('/')))
	);
}

/**
 * The candidate's match of every stand-in path, or `false` when it takes none
 * or only some, holds the sentinel itself, or its matcher throws on one (a
 * stand-in is not a request path, so a throw means "does not take it").
 */
export function takesAll(
	candidate: CompiledRestRoute,
	standIns: readonly string[],
): MatchResult | false {
	if (candidate.pattern.includes(SENTINEL)) return false;
	let first: MatchResult | undefined;
	for (const standIn of standIns) {
		let result: MatchResult | false;
		try {
			result = candidate.matcher(standIn);
		} catch {
			return false;
		}
		if (result === false) return false;
		first ??= result;
	}
	return first ?? false;
}

/** Whether the route is plain text: no parameter, wildcard or group. A route that does not parse is. */
function isLiteral(route: string): boolean {
	try {
		return parsePattern(route).every((token) => token.type === 'text');
	} catch {
		return true;
	}
}
