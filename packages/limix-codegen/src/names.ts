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
	for (const methods of Object.values(rules.rest ?? {})) {
		for (const rule of Object.values(methods)) if (rule) visit(rule);
	}
	for (const fields of Object.values(rules.graphql ?? {})) {
		for (const rule of Object.values(fields ?? {})) if (rule) visit(rule);
	}
	const sorted = (set: Set<string>) => [...set].sort(compareText);
	return {
		permissions: sorted(permissions),
		roles: sorted(roles),
		conditions: sorted(conditions),
	};
}
