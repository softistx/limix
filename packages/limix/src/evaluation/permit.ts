import { type Claims, isAuthenticated } from './claims';
import type { Step } from './steps';

type Alternatives = readonly (readonly string[])[];

/** The authentication floor: a rule that is not `public` needs a signed-in caller. */
export function floorStep(
	rule: { public?: boolean | null | undefined },
	claims: Claims,
) {
	const open = rule.public === true;
	return {
		kind: 'floor',
		label: open
			? 'public: no sign-in needed'
			: 'a signed-in caller is required',
		passed: open || isAuthenticated(claims),
	} satisfies Step;
}

/** The strings of a claim that should be a list; anything else holds nothing. */
function stringsOf(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === 'string')
		: [];
}

/** Fail closed: a `roles` claim that is not a list holds no role. */
export function holdsRole(claims: Claims): (role: string) => boolean {
	const roles = new Set(stringsOf(claims.roles));
	return (role) => roles.has(role);
}

/**
 * In `scope` (a string, else nothing holds), and in `permissions` too when that
 * claim is present (a non-list holds nothing).
 */
export function holdsPermission(claims: Claims): (name: string) => boolean {
	const scope = new Set(
		typeof claims.scope === 'string'
			? claims.scope.split(' ').filter(Boolean)
			: [],
	);
	const held =
		claims.permissions === undefined
			? undefined
			: new Set(stringsOf(claims.permissions));
	return (name) => scope.has(name) && (held === undefined || held.has(name));
}

/** Outer list OR, inner list AND; an empty alternative holds for nobody. */
export function dnfStep(
	kind: 'roles' | 'permissions',
	alternatives: Alternatives,
	holds: (name: string) => boolean,
): Step {
	const terms = alternatives.flatMap((alternative, index) =>
		alternative.map((label) => ({
			label,
			passed: holds(label),
			alternative: index,
		})),
	);
	const passed = alternatives.some(
		(alternative) => alternative.length > 0 && alternative.every(holds),
	);
	return { kind, label: `${kind}, one alternative must hold`, passed, terms };
}
