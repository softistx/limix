import type { BaseContext } from '@softistx/alxia';
import type { CompiledPolicy, RestRequest } from '@softistx/limix';
import { decodedPath, limixPath, paramsOf } from './path';

/** What the guard reads off a request, as `evaluateRest` takes it (the claims are added by the caller). */
export interface RestCall {
	method: string;
	/** Only for a wildcard route whose tail is empty: the pattern, so `/files/*path` takes `/files`. */
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

/** Whether the route ends in a wildcard that matched nothing (`/files`, `/files/`). */
const emptyTail = (
	route: string,
	pathParams: Readonly<Record<string, string>>,
) => route.endsWith('*') && (pathParams['*'] ?? '') === '';

/**
 * What the request is judged by: its method, its path (the route it reached,
 * `route` given by the caller once it has checked one was reached, with the
 * decoded parameters put back), the parameters and query, and the JSON body
 * when a rule of this method reads it. No route pattern goes to the rules
 * (they are walked in order against the path as the handler sees it), except
 * for a wildcard route with an empty tail, which no path segment names.
 */
export async function restCall(
	ctx: BaseContext,
	route: string,
	policy: CompiledPolicy,
): Promise<RestCall> {
	const { method } = ctx.request;
	return {
		method,
		...(emptyTail(route, ctx.pathParams) ? { route: limixPath(route) } : {}),
		path: decodedPath(route, ctx.pathParams),
		request: {
			params: paramsOf(ctx.pathParams),
			query: queryOf(ctx.url),
			...(readsBody(policy, method) ? { json: await jsonOf(ctx.request) } : {}),
		},
	};
}
