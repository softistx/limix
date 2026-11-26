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

export function holdsRole(claims: Claims): (role: string) => boolean {
	const roles = new Set(claims.roles ?? []);
	return (role) => roles.has(role);
}

/** In `scope`, and in `permissions` too when the caller carries that list. */
export function holdsPermission(claims: Claims): (name: string) => boolean {
	const scope = new Set((claims.scope ?? '').split(' ').filter(Boolean));
	const held = claims.permissions ? new Set(claims.permissions) : undefined;
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
