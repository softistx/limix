import type { BaseContext } from '@softistx/alxia';
import type { CompiledPolicy, RestRequest } from '@softistx/limix';
import { decodedPath, paramsOf } from './path';

/** What the guard reads off a request, as `evaluateRest` takes it (the claims are added by the caller). */
export interface RestCall {
	method: string;
	/** Only for a wildcard route whose tail is empty: the rule it stands for, so `/files/*path` takes `/files`. */
	route?: string;
	path: string;
	request: RestRequest;
}

/** The query as the handler's `query` reads it before validation: a string, a list for a repeated name. */
function queryOf(url: URL): Record<string, string | string[]> {
	const query: Record<string, string | string[]> = {};
	for (const name of new Set(url.searchParams.keys())) {
		const values = url.searchParams.getAll(name);
		query[name] = values.length === 1 ? (values[0] as string) : values;
	}
	return query;
}

/** Whether a rule for this method (a HEAD's GET rule too) reads `json.` in a relation term. */
export function readsBody(policy: CompiledPolicy, method: string): boolean {
	const methods = method === 'HEAD' ? ['HEAD', 'GET'] : [method];
	return methods.some((name) =>
		policy.restRoutesByMethod.get(name)?.some((route) => route.readsBody),
	);
}

/**
 * The body as JSON, read from a clone so the handler still reads its own: only
 * for a JSON request, and only when a rule needs it. A body over the route's
 * limit refuses here as it would in the handler (413); text that is no JSON is
 * `undefined`, so a term reading it finds nothing.
 */
async function jsonOf(request: Request): Promise<unknown> {
	const type = request.headers.get('content-type') ?? '';
	// As alxia reads one: any type that mentions json.
	if (!type.toLowerCase().includes('json')) return undefined;
	const text = await request.clone().text();
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** A pattern ending in a wildcard, alone or inside an optional group. */
const endsWild = (pattern: string) => /\*[A-Za-z_$][\w$]*\}*$/.test(pattern);

/**
 * The rule an empty wildcard tail (`/users/me` on `/users/:id/*`) stands for,
 * found as core would walk them in document order: the first that takes the
 * path without the tail, else the first ending in a wildcard that takes it with
 * a segment (`/_`) added, as alxia's optional tail matches a `*path` rule. Only
 * wildcard rules are tried with the sentinel, so a literal `/x/_` never matches
 * falsely.
 */
function emptyTailRule(
	policy: CompiledPolicy,
	method: string,
	base: string,
): string | undefined {
	const routes = (method === 'HEAD' ? ['HEAD', 'GET'] : [method]).flatMap(
		(name) => policy.restRoutesByMethod.get(name) ?? [],
	);
	const exact = routes.find((route) => route.matcher(base) !== false);
	if (exact) return exact.pattern;
	return routes.find(
		(route) => endsWild(route.pattern) && route.matcher(`${base}/_`) !== false,
	)?.pattern;
}

/**
 * What the request is judged by: its method, its path (the route it reached,
 * `route` given by the caller once it has checked one was reached, with the
 * decoded parameters put back), the parameters and query, and the JSON body
 * when a rule of this method reads it. No route pattern goes to the rules
 * (they are walked in order against the path as the handler sees it), except
 * for a wildcard route with an empty tail, which takes the rule the tail
 * would have met (see `emptyTailRule`).
 */
export async function restCall(
	ctx: BaseContext,
	route: string,
	policy: CompiledPolicy,
): Promise<RestCall> {
	const { method } = ctx.request;
	const full = decodedPath(route, ctx.pathParams);
	const tail = route.endsWith('*') && (ctx.pathParams['*'] ?? '') === '';
	const base = tail && full.length > 1 ? full.replace(/\/$/, '') : full;
	const rule = tail ? emptyTailRule(policy, method, base) : undefined;
	return {
		method,
		...(rule === undefined ? {} : { route: rule }),
		path: tail ? base : full,
		request: {
			params: paramsOf(ctx.pathParams),
			query: queryOf(ctx.url),
			...(readsBody(policy, method) ? { json: await jsonOf(ctx.request) } : {}),
		},
	};
}
