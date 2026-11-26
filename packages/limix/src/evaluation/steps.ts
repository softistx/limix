import type { Decision } from './refusal';

export type StepKind =
	| 'source'
	| 'match'
	| 'unmatched'
	| 'floor'
	| 'roles'
	| 'permissions'
	| 'when'
	| 'relations';

/** One term tried, and what it answered. */
export interface TermStep {
	label: string;
	passed: boolean;
	/** The alternative of the DNF this term belongs to, when it is one. */
	alternative?: number | undefined;
	note?: string | undefined;
}

/** One stage of an evaluation, in the order it ran. */
export interface Step {
	kind: StepKind;
	label: string;
	passed: boolean;
	terms?: TermStep[] | undefined;
	/** The rung of a `relations` step, from 0. */
	rung?: number | undefined;
}

/** An evaluation and every step that led to it: what `explain` returns, and what the evaluators reduce to a decision. */
export interface Explanation {
	decision: Decision;
	steps: Step[];
}
