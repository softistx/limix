import type { Rules } from '@softistx/limix';
import { compareText } from './order';

/** The permission, role and condition names a rules document holds. */
export interface RulesNames {
	permissions: string[];
	roles: string[];
	conditions: string[];
}

interface RuleLike {
	permissions?: readonly (readonly string[])[] | null | undefined;
	roles?: readonly (readonly string[])[] | null | undefined;
	when?: readonly string[] | null | undefined;
}

/**
 * A flat REST key (`POST /users/:id`, `* /admin/*`), as core reads it (its
 * `rules/keys.ts`): a method or `*`, one space, a pattern. Core exports no
 * such test yet; the copy stays this short.
 */
const FLAT_REST_KEY =
	/^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE|QUERY|\*) \S/;

/** Each name once, sorted by code unit, walking every REST and GraphQL rule. */
export function rulesNames(rules: Rules): RulesNames {
	const permissions = new Set<string>();
	const roles = new Set<string>();
	const conditions = new Set<string>();
	const visit = (rule: RuleLike) => {
		for (const name of rule.permissions?.flat() ?? []) permissions.add(name);
		for (const name of rule.roles?.flat() ?? []) roles.add(name);
		for (const name of rule.when ?? []) conditions.add(name);
	};
	for (const [key, value] of Object.entries(rules.rest ?? {})) {
		// A flat key holds the rule itself, a path pattern a rule per method.
		if (FLAT_REST_KEY.test(key)) visit(value as RuleLike);
		else {
			for (const rule of Object.values(value) as (RuleLike | undefined)[]) {
				if (rule) visit(rule);
			}
		}
	}
	for (const [key, value] of Object.entries(rules.graphql ?? {})) {
		// `Type.field` and `Type.*` hold the rule itself, a type name a rule per field.
		if (key.includes('.')) visit(value as RuleLike);
		else for (const rule of Object.values(value ?? {})) if (rule) visit(rule);
	}
	const sorted = (set: Set<string>) => [...set].sort(compareText);
	return {
		permissions: sorted(permissions),
		roles: sorted(roles),
		conditions: sorted(conditions),
	};
}
