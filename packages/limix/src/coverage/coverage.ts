import { graphqlEntry } from '../evaluation/graphql-entry';
import { ruleSetsForMethod } from '../evaluation/rest-routes';
import type { CompiledPolicy } from '../rules';
import { findOperationRoute } from './lookup';
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
	 * On `covered` and `public` REST entries: `exact` when the rule's own
	 * pattern names the path, `pattern` when its matcher took it (another
	 * spelling, such as `/things/{id}` or `/things/:docId` for `/things/:id`).
	 * A `pattern` hit means the rule's matcher takes this path spelling, as
	 * `evaluateRest` would for a request with that path; it says nothing about
	 * other request paths, so bring the spelling into line. An operation path
	 * holding a wildcard (`*name`) or an optional group with a parameter is
	 * never reported through a `pattern` hit: it is `uncovered` unless a rule
	 * spells it exactly.
	 *
	 * `wildcard` takes precedence over both: the rule that applies is a method
	 * `*` rule (REST) or a `Type.*` rule (GraphQL). It is never a spelling to
	 * fix, so a gate on `pattern` does not fail on it. A GraphQL operation has
	 * a `match` only when the hit is a wildcard.
	 */
	match?: 'exact' | 'pattern' | 'wildcard';
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
	/** Uncovered operations `global.unmatched: allow` leaves open (a non-root GraphQL field is always one). */
	open: number;
	/** REST operations a rule reaches by its matcher, not by its own pattern. */
	byPattern: number;
	/** Operations a `*` method rule or a `Type.*` rule reaches. */
	byWildcard: number;
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
 * `ruleSetsForMethod`): one walk in document order, the operation read as an
 * already-matched route, with and without `global.basePath`, and HEAD faces the
 * GET rules too. A rule reached by a matcher is used and reported
 * `match: 'pattern'`, a method `*` rule `match: 'wildcard'`. A GraphQL
 * operation is looked up as `evaluateField` does (a `Type.*` rule is a
 * `wildcard` hit), and only a root one falls
 * under `unmatched`.
 *
 * Runs in a browser or an edge runtime. Throws a `TypeError` when
 * `operations` is not an array or holds a value that is not an `Operation`.
 */
export function coverage(
	policy: CompiledPolicy,
	operations: readonly Operation[],
): CoverageReport {
	if (!Array.isArray(operations)) {
		throw new TypeError('coverage: `operations` must be an array');
	}
	operations.forEach(assertOperation);
	const entries = operations.map((operation) => ({
		operation,
		label: labelOf(operation),
		...(operation.kind === 'rest'
			? restStatus(policy, operation)
			: graphqlStatus(policy, operation)),
	}));
	const stale = [
		...staleRest(
			policy,
			operations.filter((op) => op.kind === 'rest'),
		),
		...staleGraphql(
			policy,
			operations.filter((op) => op.kind === 'graphql'),
		),
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
			open: entries.filter((entry) => entry.unmatched === 'allow').length,
			byPattern: entries.filter((entry) => entry.match === 'pattern').length,
			byWildcard: entries.filter((entry) => entry.match === 'wildcard').length,
			stale: stale.length,
		},
	};
}

type Verdict = Pick<OperationCoverage, 'status' | 'unmatched' | 'match'>;

function restStatus(policy: CompiledPolicy, operation: RestOperation): Verdict {
	const sets = ruleSetsForMethod(policy, operation.method.toUpperCase());
	const matches = sets.map((routes) =>
		findOperationRoute(routes, operation.path, policy.global.basePath),
	);
	// The last set is the handler's: without a rule there, the request falls to
	// `unmatched`, whatever the earlier sets hold (a HEAD-only rule).
	if (!matches[matches.length - 1]) return uncovered(policy.global.unmatched);
	const everyPublic = matches.every(
		(match) => !match || match.route.rule.public,
	);
	const match = matches.some((hit) => hit?.match === 'wildcard')
		? 'wildcard'
		: matches.some((hit) => hit?.match === 'pattern')
			? 'pattern'
			: 'exact';
	return { status: everyPublic ? 'public' : 'covered', match };
}

function graphqlStatus(
	policy: CompiledPolicy,
	operation: GraphqlOperation,
): Verdict {
	const entry = graphqlEntry(policy, operation.type, operation.field);
	if (!entry)
		return uncovered(operation.root ? policy.global.unmatched : 'allow');
	return {
		status: entry.rule.public ? 'public' : 'covered',
		...(entry.wildcard ? { match: 'wildcard' as const } : {}),
	};
}

const uncovered = (unmatched: 'allow' | 'deny'): Verdict => ({
	status: 'uncovered',
	unmatched,
});
