import { DEFAULT_FROM } from '../rules/terms';
import { type Claims, isAuthenticated } from './claims';
import { graphqlEntry } from './graphql-entry';
import { heldPolicy, noPolicy, type PolicyInput } from './held';
import { ALLOW, type Decision, forbidden, unauthenticated } from './refusal';
import type { RelationChecker } from './relations';
import { ROOT_TYPES } from './roots';
import { applyRule } from './rule';
import type { Explanation, Step } from './steps';

export interface FieldInput {
	/** The type the field is on: `Query`, `Mutation`, `Subscription` or any other type name. */
	type: string;
	field: string;
	/**
	 * Whether the type is an operation root, so `global.unmatched` applies to it.
	 * Defaults to the type being named `Query`, `Mutation` or `Subscription`: an
	 * integration whose schema renames a root sets it from the schema.
	 */
	root?: boolean | undefined;
	claims: Claims;
	args?: Readonly<Record<string, unknown>> | undefined;
	/** The resolver's parent value; ids can be read from `source.`. */
	source?: unknown;
	/** Handed to `when` conditions as `info`. */
	info?: unknown;
	relations?: RelationChecker | undefined;
}

/** Every step of one field's evaluation: what `evaluateField` reduces to its decision. */
export async function decideField(
	input: PolicyInput,
	call: FieldInput,
): Promise<Explanation> {
	if (typeof call.claims !== 'object' || call.claims === null) {
		throw new TypeError('evaluateField: pass the `claims`');
	}
	const policy = heldPolicy(input);
	if (!policy) return noPolicy();
	const where = `${call.type}.${call.field}`;
	const steps: Step[] = [];
	const entry = graphqlEntry(policy, call.type, call.field);
	if (!entry) {
		const root = call.root ?? ROOT_TYPES.has(call.type);
		const open = !root || policy.global.unmatched !== 'deny';
		steps.push({
			kind: 'unmatched',
			label: root
				? `no rule names ${where}, and \`global.unmatched\` is ${policy.global.unmatched}`
				: `no rule names ${where}; only root fields fall under \`global.unmatched\``,
			passed: open,
		});
		const decision: Decision = open
			? ALLOW
			: isAuthenticated(call.claims)
				? forbidden()
				: unauthenticated();
		return { decision, steps };
	}
	steps.push({
		kind: 'match',
		label: entry.wildcard ? `${where} (${call.type}.*)` : where,
		passed: true,
	});
	const args = call.args ?? {};
	const decision = await applyRule(
		entry.rule,
		entry.conditions,
		{
			claims: call.claims,
			relations: call.relations,
			roots: { args, source: call.source },
			defaultFrom: DEFAULT_FROM.graphql,
			context: {
				claims: call.claims,
				args,
				source: call.source,
				...(call.info === undefined ? {} : { info: call.info }),
			},
		},
		steps,
	);
	return { decision, steps };
}

export async function evaluateField(
	policy: PolicyInput,
	input: FieldInput,
): Promise<Decision> {
	return (await decideField(policy, input)).decision;
}
