import type { CompiledPolicy } from '../rules';
import { isPolicySource, type PolicySource } from '../source';
import { unavailable } from './refusal';
import type { Explanation } from './steps';

/** What an evaluator takes: a compiled policy, or a source that may not hold one yet. */
export type PolicyInput = CompiledPolicy | PolicySource;

/** The policy now held, or `null` for a source that has none. */
export function heldPolicy(input: PolicyInput): CompiledPolicy | null {
	return isPolicySource(input) ? input.current() : input;
}

/** Fail closed: no policy held refuses everything. Fresh on each call, so no caller can change the next answer. */
export const noPolicy = (): Explanation => ({
	decision: unavailable('no-policy'),
	steps: [
		{
			kind: 'source',
			label: 'the policy source holds no policy',
			passed: false,
		},
	],
});
