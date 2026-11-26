import type { Condition, ConditionContext } from '../rules';
import type { Step, TermStep } from './steps';

/**
 * Every named condition must hold. A predicate that throws, or answers
 * anything but `true`, denies: the walk stops at the first one that fails.
 * `names` and `conditions` line up, since compiling refuses an unknown name.
 */
export async function whenStep(
	names: readonly string[],
	conditions: readonly Condition[],
	context: ConditionContext,
): Promise<Step> {
	const terms: TermStep[] = [];
	for (const [index, name] of names.entries()) {
		const condition = conditions[index];
		let note: string | undefined;
		let passed = false;
		try {
			passed = (await condition?.(context)) === true;
		} catch (error) {
			note = `threw: ${error instanceof Error ? error.message : String(error)}`;
		}
		terms.push({ label: name, passed, note });
		if (!passed) break;
	}
	return {
		kind: 'when',
		label: 'every condition must hold',
		passed: terms.every((term) => term.passed),
		terms,
	};
}
