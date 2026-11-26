import { type CompiledPolicy, DEFAULT_FROM } from '../rules';
import { type Claims, isAuthenticated } from './claims';
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

interface RestBase {
	/** The HTTP method, any case. */
	method: string;
	claims: Claims;
	request?: RestRequest | undefined;
	relations?: RelationChecker | undefined;
	/** Handed to `when` conditions as `info`. */
	info?: unknown;
}

/**
 * What the integration read off the request, and where: an already-matched
 * `route` pattern (as the rules file spells it), the request `path`, or both
 * (`path` is tried when `route` names no rule). Neither is a type error.
 */
export type RestInput = RestBase &
	(
		| { route: string; path?: string | undefined }
		| { path: string; route?: string | undefined }
	);

/** Every step of a REST evaluation: what `evaluateRest` reduces to its decision. */
export async function decideRest(
	input: PolicyInput,
	call: RestInput,
): Promise<Explanation> {
	if (typeof call.claims !== 'object' || call.claims === null) {
		throw new TypeError('evaluateRest: pass the `claims`');
	}
	const policy = heldPolicy(input);
	if (!policy) return noPolicy();
	// A JS caller may pass `null` or a number: anything but a string is no
	// route, so a missing route never falls through to `unmatched: allow`.
	if (typeof call.route !== 'string' && typeof call.path !== 'string') {
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
	return isAuthenticated(call.claims) ? forbidden() : unauthenticated();
}

export async function evaluateRest(
	policy: PolicyInput,
	input: RestInput,
): Promise<Decision> {
	return (await decideRest(policy, input)).decision;
}
