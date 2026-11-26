import type { ConditionContext } from '../rules';
import type { Claims, Subject } from './claims';
import { readIds } from './ids';
import {
	ALLOW,
	type Decision,
	denied,
	forbidden,
	unavailable,
} from './refusal';
import type { RelationChecker, RelationQuery } from './relations';
import type { Step, TermStep } from './steps';

interface Term {
	relation: string;
	type: string;
	from?: string | undefined;
}

export interface Rung {
	require: readonly (readonly Term[])[];
	onDeny?: 'NOT_FOUND' | 'FORBIDDEN' | undefined;
	code?: string | undefined;
}

/** What a rule is evaluated against: the caller, the roots ids are read from, the port. */
export interface RuleEnv {
	claims: Claims;
	relations: RelationChecker | undefined;
	/** `param`/`query`/`json` for REST, `args`/`source` for GraphQL. */
	roots: Readonly<Record<string, unknown>>;
	defaultFrom: string;
	context: ConditionContext;
}

/** Rungs in declaration order; the first that fails denies with its own answer. */
export async function runRungs(
	rungs: readonly Rung[],
	env: RuleEnv,
	steps: Step[],
): Promise<Decision> {
	const { relations, claims } = env;
	if (!relations) {
		steps.push({
			kind: 'relations',
			label: 'the rule declares relations but no RelationChecker was supplied',
			passed: false,
		});
		return unavailable('no-relation-checker');
	}
	if (!claims.subject) {
		steps.push({
			kind: 'relations',
			label: 'the caller has no subject to ask the relations about',
			passed: false,
		});
		return forbidden('no-subject');
	}
	for (const [index, rung] of rungs.entries()) {
		const result = await runRung(rung, index, claims.subject, relations, env);
		steps.push(result.step);
		if (!result.passed) return denied(rung.onDeny ?? 'NOT_FOUND', rung.code);
	}
	return ALLOW;
}

/** One rung: every query of every term goes to the checker in a single call. */
async function runRung(
	rung: Rung,
	index: number,
	subject: Subject,
	checker: RelationChecker,
	env: RuleEnv,
): Promise<{ passed: boolean; step: Step }> {
	const queries: RelationQuery[] = [];
	const alternatives = rung.require.map((alternative) =>
		alternative.map((term) => {
			const from = term.from ?? env.defaultFrom;
			const ids = readIds(env.roots, from);
			const start = queries.length;
			for (const id of ids) {
				queries.push({
					subject,
					relation: term.relation,
					object: { type: term.type, id },
				});
			}
			return { term, from, count: ids.length, start };
		}),
	);
	const answers = queries.length > 0 ? await checker.check(queries) : [];
	if (!Array.isArray(answers) || answers.length !== queries.length) {
		throw new Error(
			`limix: the RelationChecker answered ${Array.isArray(answers) ? answers.length : 'nothing'} for ${queries.length} queries; it must return one boolean per query, in order`,
		);
	}
	const terms: TermStep[][] = alternatives.map((alternative, alt) =>
		alternative.map(({ term, from, count, start }) => ({
			label: `${term.relation} on ${term.type} from ${from}`,
			passed:
				count > 0 &&
				answers.slice(start, start + count).every((answer) => answer === true),
			alternative: alt,
			note: count === 0 ? `\`${from}\` resolved no object id` : undefined,
		})),
	);
	const passed = terms.some(
		(alternative) =>
			alternative.length > 0 && alternative.every((term) => term.passed),
	);
	return {
		passed,
		step: {
			kind: 'relations',
			label: `rung ${index + 1}, answered ${rung.onDeny ?? 'NOT_FOUND'} when it fails`,
			passed,
			rung: index,
			terms: terms.flat(),
		},
	};
}
