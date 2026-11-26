import type { Condition } from '../rules';
import { whenStep } from './conditions';
import { dnfStep, floorStep, holdsPermission, holdsRole } from './permit';
import { ALLOW, type Decision, forbidden, unauthenticated } from './refusal';
import { type RuleEnv, type Rung, runRungs } from './rungs';
import type { Step } from './steps';

/** The terms both a REST rule and a GraphQL field rule carry. */
interface RuleTerms {
	public?: boolean | null | undefined;
	roles?: readonly (readonly string[])[] | null | undefined;
	permissions?: readonly (readonly string[])[] | null | undefined;
	when?: readonly string[] | null | undefined;
	relations?: readonly Rung[] | undefined;
}

/**
 * The ladder of one matched rule, cheapest first: sign-in (401), roles,
 * permissions and `when` (403), then the relation rungs (their own answer).
 * Every stage is pushed on `steps`, so `explain` and the evaluators walk the
 * same code. A relation rung is the only stage that leaves the process.
 */
export async function applyRule(
	rule: RuleTerms,
	conditions: readonly Condition[],
	env: RuleEnv,
	steps: Step[],
): Promise<Decision> {
	const floor = floorStep(rule, env.claims);
	steps.push(floor);
	if (!floor.passed) return unauthenticated();
	if (rule.roles) {
		const step = dnfStep('roles', rule.roles, holdsRole(env.claims));
		steps.push(step);
		if (!step.passed) return forbidden();
	}
	if (rule.permissions) {
		const step = dnfStep(
			'permissions',
			rule.permissions,
			holdsPermission(env.claims),
		);
		steps.push(step);
		if (!step.passed) return forbidden();
	}
	if (rule.when?.length) {
		const step = await whenStep(rule.when, conditions, env.context);
		steps.push(step);
		if (!step.passed) return forbidden();
	}
	if (rule.relations?.length) return runRungs(rule.relations, env, steps);
	return ALLOW;
}
