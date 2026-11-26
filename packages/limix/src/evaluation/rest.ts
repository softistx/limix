import { type CompiledPolicy, DEFAULT_FROM } from '../rules';
import type { Claims } from './claims';
import { heldPolicy, noPolicy, type PolicyInput } from './held';
import { ALLOW, type Decision, forbidden, unauthenticated } from './refusal';
import type { RelationChecker } from './relations';
import { findRoute, ruleSetsForMethod } from './rest-routes';
import { applyRule } from './rule';
import type { Explanation, Step } from './steps';

/** What the integration read off the request. */
export interface RestRequest {
	params?: Readonly<Record<string, unknown>> | undefined;
	query?: Readonly<Record<string, unknown>> | undefined;
	/** The parsed JSON body; only needed when a relation term reads `json.`. */
	json?: unknown;
}

export interface RestInput {
	/** The HTTP method, any case. */
	method: string;
	/** An already-matched route pattern, as the framework declared it. Wins over `path`. */
	route?: string | undefined;
	/** The request pathname, matched against the compiled table when no `route` is given. */
	path?: string | undefined;
	claims: Claims;
	request?: RestRequest | undefined;
	relations?: RelationChecker | undefined;
	/** Handed to `when` conditions as `info`. */
	info?: unknown;
}

/** Every step of a REST evaluation: what `evaluateRest` reduces to its decision. */
export async function decideRest(
	input: PolicyInput,
	call: RestInput,
): Promise<Explanation> {
	const policy = heldPolicy(input);
	if (!policy) return noPolicy();
	if (call.route === undefined && call.path === undefined) {
		throw new TypeError('evaluateRest: pass the `route` or the `path`');
	}
	const method = call.method.toUpperCase();
	const steps: Step[] = [];
	const sets = ruleSetsForMethod(policy, method);
	for (const [index, routes] of sets.entries()) {
		const match = findRoute(routes, call, policy.global.basePath);
		if (!match && index < sets.length - 1) continue;
		const decision = match
			? await applyMatch(match, method, call, steps)
			: unmatched(policy, method, call, steps);
		if (!decision.allow) return { decision, steps };
	}
	return { decision: ALLOW, steps };
}

async function applyMatch(
	{ route, params }: NonNullable<ReturnType<typeof findRoute>>,
	method: string,
	call: RestInput,
	steps: Step[],
): Promise<Decision> {
	const request = {
		params: { ...params, ...call.request?.params },
		query: call.request?.query ?? {},
		json: call.request?.json,
	};
	steps.push({
		kind: 'match',
		label: `${method} ${route.pattern}`,
		passed: true,
	});
	return applyRule(
		route.rule,
		route.conditions,
		{
			claims: call.claims,
			relations: call.relations,
			roots: {
				param: request.params,
				query: request.query,
				json: request.json,
			},
			defaultFrom: DEFAULT_FROM.rest,
			context: {
				claims: call.claims,
				request,
				...(call.info === undefined ? {} : { info: call.info }),
			},
		},
		steps,
	);
}

/** What no rule names gets: open under `unmatched: allow`, 401 or 403 under `deny`. */
function unmatched(
	policy: CompiledPolicy,
	method: string,
	call: RestInput,
	steps: Step[],
): Decision {
	const open = policy.global.unmatched !== 'deny';
	steps.push({
		kind: 'unmatched',
		label: `no rule names ${method} ${call.route ?? call.path}, and \`global.unmatched\` is ${policy.global.unmatched}`,
		passed: open,
	});
	if (open) return ALLOW;
	return call.claims.authenticated ? forbidden() : unauthenticated();
}

export async function evaluateRest(
	policy: PolicyInput,
	input: RestInput,
): Promise<Decision> {
	return (await decideRest(policy, input)).decision;
}
