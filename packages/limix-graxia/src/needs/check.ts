import { needsOf } from '@softistx/graxia/agent';
import type { CompiledGraphqlEntry, CompiledPolicy } from '@softistx/limix';
import {
	type GraphQLField,
	type GraphQLSchema,
	getNamedType,
	isInterfaceType,
	isIntrospectionType,
	isObjectType,
} from 'graphql';
import { entryOf } from '../governs';
import { type FieldFacts, issue, type NeedsIssue } from './issues';
import {
	type Cnf,
	cnfToDnf,
	dnfImpliesCnf,
	dnfImpliesDnf,
	dnfToCnf,
	needsText,
} from './logic';

/** `@needs` of the type, the field and (one level) the type it returns, all ANDed. */
function needsOfField(
	type: Parameters<typeof needsOf>[0],
	field: GraphQLField<unknown, unknown>,
): Cnf {
	const returned = getNamedType(field.type);
	return [
		...needsOf(type),
		...needsOf(field),
		...(isObjectType(returned) || isInterfaceType(returned)
			? needsOf(returned)
			: []),
	];
}

type Rule = CompiledGraphqlEntry['rule'];

/** The permissions a rule enforces: none for no rule, a public one or one that names none. */
function enforced(
	rule: Rule | undefined,
): readonly (readonly string[])[] | undefined {
	return rule === undefined || rule.public === true
		? undefined
		: (rule.permissions ?? undefined);
}

/** The disagreement that needs no comparison: a bad `@needs`, or `@needs` where nothing is enforced. */
function coverageIssue(
	facts: FieldFacts,
	rule: Rule | undefined,
): NeedsIssue | undefined {
	const { needs, coordinate: at } = facts;
	if (needs.some((group) => group.length === 0)) {
		return issue(
			'needs-invalid',
			facts,
			'a @needs gives both `permission` and `anyOf`, or neither, so no caller meets it',
			`Give each @needs on ${at} exactly one of permission or anyOf.`,
		);
	}
	if (needs.length === 0 || enforced(rule) !== undefined) return undefined;
	return rule === undefined
		? issue(
				'needs-without-rule',
				facts,
				'@needs names permissions but the rules file has no rule here',
				`Add a rule for ${at} under graphql, with the permissions @needs names.`,
			)
		: issue(
				'needs-unenforced',
				facts,
				'@needs names permissions but the rule enforces none',
				`List the permissions @needs names under permissions of the rule on ${at}, or drop @needs.`,
			);
}

/** `@needs` against the permissions the rule enforces: missing, too complex, looser, stricter. */
function implicationIssues(
	facts: FieldFacts,
	permissions: readonly (readonly string[])[],
): NeedsIssue[] {
	const { needs, coordinate: at } = facts;
	const withRule = { ...facts, permissions };
	if (needs.length === 0) {
		const cnf = dnfToCnf(permissions);
		return [
			issue(
				'rule-without-needs',
				withRule,
				'the rule requires permissions but the schema has no @needs, so a caller who lacks them still sees the field',
				cnf === undefined
					? `Add @needs on ${at} that says the rule's permissions.`
					: `Add ${needsText(cnf)} on ${at}.`,
				cnf === undefined ? undefined : needsText(cnf),
			),
		];
	}
	const dnf = cnfToDnf(needs);
	if (dnf === undefined) {
		return [
			issue(
				'needs-too-complex',
				withRule,
				'@needs expands to more than 1024 alternatives, too many to compare with the rule',
				`Split the @needs on ${at} into fewer any-of groups.`,
			),
		];
	}
	const out: NeedsIssue[] = [];
	if (!dnfImpliesDnf(dnf, permissions)) {
		out.push(
			issue(
				'needs-looser',
				withRule,
				'a caller who meets @needs can still be refused by the rule: @needs is looser than the rule',
				`Add to @needs on ${at} the permissions the rule requires, or relax the rule.`,
			),
		);
	}
	if (!dnfImpliesCnf(permissions, needs)) {
		out.push(
			issue(
				'needs-stricter',
				withRule,
				'a caller who passes the rule can still be hidden the field: @needs is stricter than the rule',
				`Drop from @needs on ${at} what the rule does not require, or add it to the rule.`,
			),
		);
	}
	return out;
}

function judge(facts: FieldFacts, rule: Rule | undefined): NeedsIssue[] {
	const bad = coverageIssue(facts, rule);
	if (bad) return [bad];
	const permissions = enforced(rule);
	return permissions === undefined ? [] : implicationIssues(facts, permissions);
}

/**
 * Checks that each object field's `@needs` (its own, its type's and its
 * returned type's) says what the rule on it enforces, for permissions only:
 * roles, `when` and relations are extra restrictions `@needs` cannot express.
 * Returns the issues in schema order; none means they agree.
 */
export function checkNeeds(
	policy: CompiledPolicy,
	schema: GraphQLSchema,
): readonly NeedsIssue[] {
	return Object.values(schema.getTypeMap()).flatMap((type) =>
		isObjectType(type) && !isIntrospectionType(type)
			? Object.values(type.getFields()).flatMap((field) =>
					judge(
						{
							coordinate: `${type.name}.${field.name}`,
							needs: needsOfField(type, field),
						},
						entryOf(policy, type.name, field.name)?.rule,
					),
				)
			: [],
	);
}
