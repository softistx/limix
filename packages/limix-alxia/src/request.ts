import type { BaseContext } from '@softistx/alxia';
import type { CompiledPolicy, RestRequest } from '@softistx/limix';
import { limixPath, paramsOf } from './path';

/** What the guard reads off a request, as `evaluateRest` takes it (the claims are added by the caller). */
export interface RestCall {
	method: string;
	route: string;
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
	if (!/^application\/(?:[\w.+-]+\+)?json\b/i.test(type)) return undefined;
	const text = await request.clone().text();
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/**
 * The route the request reached (`ctx.route`, given by the caller once it has
 * checked one was reached), its path, parameters and query, and the JSON body
 * when a rule of this method reads it.
 */
export async function restCall(
	ctx: BaseContext,
	route: string,
	policy: CompiledPolicy,
): Promise<RestCall> {
	const { method } = ctx.request;
	return {
		method,
		route: limixPath(route),
		path: ctx.url.pathname,
		request: {
			params: paramsOf(ctx.pathParams),
			query: queryOf(ctx.url),
			...(readsBody(policy, method) ? { json: await jsonOf(ctx.request) } : {}),
		},
	};
}
