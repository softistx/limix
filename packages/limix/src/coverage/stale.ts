import {
	ruleSetsForMethod,
	standInsOf,
	takesAll,
} from '../evaluation/rest-routes';
import { ROOT_TYPES } from '../evaluation/roots';
import type { CompiledPolicy, CompiledRestRoute } from '../rules';
import { findOperationRoute } from './lookup';
import type { GraphqlOperation, RestOperation } from './operation';

/** A rule in the policy that no operation of the list reaches. */
export type StaleRule =
	| {
			kind: 'rest';
			method: string;
			path: string;
			label: string;
			/** The earlier rule whose matcher takes this one's pattern, so it never applies. */
			shadowedBy?: { path: string; label: string };
	  }
	| { kind: 'graphql'; type: string; field: string; label: string };

/**
 * The REST rules no operation reaches, through the lookup a request takes
 * (`findRoute` over `ruleSetsForMethod`, the matcher included), so a `HEAD` operation uses the
 * `GET` rule too. Judged only when the list holds a REST operation.
 */
export function staleRest(
	policy: CompiledPolicy,
	operations: readonly RestOperation[],
): StaleRule[] {
	if (operations.length === 0) return [];
	const used = new Set<CompiledRestRoute>();
	for (const operation of operations) {
		for (const routes of ruleSetsForMethod(
			policy,
			operation.method.toUpperCase(),
		)) {
			const hit = findOperationRoute(
				routes,
				operation.path,
				policy.global.basePath,
			);
			if (hit) used.add(hit.route);
		}
	}
	const base = policy.global.basePath ?? '';
	const stale: StaleRule[] = [];
	for (const [method, routes] of policy.restRoutesByMethod) {
		for (const [index, route] of routes.entries()) {
			if (used.has(route)) continue;
			// The rules-file spelling, without the basePath compile put in front.
			const path = route.pattern.slice(base.length);
			const standIns = standInsOf(route.pattern);
			const earlier =
				standIns &&
				routes
					.slice(0, index)
					.find((candidate) => takesAll(candidate, standIns));
			stale.push({
				kind: 'rest',
				method,
				path,
				label: `${method} ${path}`,
				...(earlier && {
					shadowedBy: {
						path: earlier.pattern.slice(base.length),
						label: `${method} ${earlier.pattern.slice(base.length)}`,
					},
				}),
			});
		}
	}
	return stale;
}

/**
 * The GraphQL rules no operation reaches. A type is judged when the list
 * names it or it is a default root: a list that omits `Mutation` entirely still
 * flags a `Mutation` rule, and a rule on a type the list never mentions is
 * left alone.
 */
export function staleGraphql(
	policy: CompiledPolicy,
	operations: readonly GraphqlOperation[],
): StaleRule[] {
	if (operations.length === 0) return [];
	const judged = new Set([...ROOT_TYPES, ...operations.map((op) => op.type)]);
	const stale: StaleRule[] = [];
	for (const [type, fields] of Object.entries(policy.graphql ?? {})) {
		if (!judged.has(type)) continue;
		for (const field of Object.keys(fields)) {
			if (operations.some((op) => op.type === type && op.field === field))
				continue;
			stale.push({ kind: 'graphql', type, field, label: `${type}.${field}` });
		}
	}
	return stale;
}
