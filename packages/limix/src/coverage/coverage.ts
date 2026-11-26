import { graphqlEntry } from '../evaluation/graphql-entry';
import { findRoute, ruleSetsForMethod } from '../evaluation/rest-routes';
import type { CompiledPolicy } from '../rules';
import {
	assertOperation,
	type GraphqlOperation,
	labelOf,
	type Operation,
	type RestOperation,
} from './operation';
import { type StaleRule, staleGraphql, staleRest } from './stale';

/** `covered`: a rule asks something. `public`: a rule says `public: true`. `uncovered`: no rule names it. */
export type CoverageStatus = 'covered' | 'public' | 'uncovered';

export interface OperationCoverage {
	operation: Operation;
	/** `GET /documents/:id` or `Query.me`. */
	label: string;
	status: CoverageStatus;
	/**
	 * Only on `uncovered`: what `global.unmatched` does to it. A GraphQL
	 * operation that is not a root is never governed by it, so it is always
	 * `allow`.
	 */
	unmatched?: 'allow' | 'deny';
}

export interface CoverageSummary {
	total: number;
	covered: number;
	public: number;
	uncovered: number;
	/** Uncovered operations the guard refuses: the ones to fix before `unmatched: deny`. */
	refused: number;
	stale: number;
}

export interface CoverageReport {
	/** One entry per operation given, in the order given. */
	operations: OperationCoverage[];
	/**
	 * Rules that reach no operation. Each transport is judged only when the
	 * list holds an operation of it: a GraphQL-only list leaves the REST rules
	 * unjudged, and an empty list judges nothing.
	 */
	stale: StaleRule[];
	summary: CoverageSummary;
}

/**
 * Which of the operations the rules name, which they leave to
 * `global.unmatched`, and which rules name no operation.
 *
 * REST goes through the lookup `evaluateRest` uses (`findRoute`,
 * `ruleSetsForMethod`): the same `global.basePath` handling and the same
 * HEAD-faces-GET rule, so the report and the guard cannot disagree. A GraphQL
 * operation is looked up as `evaluateField` does, and only a root one falls
 * under `unmatched`.
 *
 * Runs in a browser or an edge runtime. Throws a `TypeError` on a value that
 * is not an `Operation`.
 */
export function coverage(
	policy: CompiledPolicy,
	operations: readonly Operation[],
): CoverageReport {
	operations.forEach(assertOperation);
	const entries = operations.map((operation) => ({
		operation,
		label: labelOf(operation),
		...(operation.kind === 'rest'
			? restStatus(policy, operation)
			: graphqlStatus(policy, operation)),
	}));
	const stale = [
		...staleRest(policy, operations.filter((op) => op.kind === 'rest')),
		...staleGraphql(policy, operations.filter((op) => op.kind === 'graphql')),
	];
	const count = (status: CoverageStatus) =>
		entries.filter((entry) => entry.status === status).length;
	return {
		operations: entries,
		stale,
		summary: {
			total: entries.length,
			covered: count('covered'),
			public: count('public'),
			uncovered: count('uncovered'),
			refused: entries.filter((entry) => entry.unmatched === 'deny').length,
			stale: stale.length,
		},
	};
}

type Verdict = Pick<OperationCoverage, 'status' | 'unmatched'>;

function restStatus(policy: CompiledPolicy, operation: RestOperation): Verdict {
	const sets = ruleSetsForMethod(policy, operation.method.toUpperCase());
	const matches = sets.map((routes) =>
		findRoute(routes, { route: operation.path }, policy.global.basePath),
	);
	// The last set is the handler's: without a rule there, the request falls to
	// `unmatched`, whatever the earlier sets hold (a HEAD-only rule).
	if (!matches[matches.length - 1]) return uncovered(policy.global.unmatched);
	const everyPublic = matches.every((match) => !match || match.route.rule.public);
	return { status: everyPublic ? 'public' : 'covered' };
}

function graphqlStatus(
	policy: CompiledPolicy,
	operation: GraphqlOperation,
): Verdict {
	const entry = graphqlEntry(policy, operation.type, operation.field);
	if (!entry) return uncovered(operation.root ? policy.global.unmatched : 'allow');
	return { status: entry.rule.public ? 'public' : 'covered' };
}

const uncovered = (unmatched: 'allow' | 'deny'): Verdict => ({
	status: 'uncovered',
	unmatched,
});
