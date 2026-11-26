import { decideField, type FieldInput } from './field';
import type { PolicyInput } from './held';
import { decideRest, type RestInput } from './rest';
import type { Explanation } from './steps';

/**
 * The evaluation of a REST request (it carries a `method`) or of a GraphQL
 * field (it carries a `field`), with every step: which rule matched, each
 * term tried and its answer, which rung refused. It runs the same code as
 * `evaluateRest` and `evaluateField`, so it cannot disagree with them. It does
 * call the `RelationChecker` and the `when` conditions, as they do.
 */
export function explain(
	policy: PolicyInput,
	input: RestInput | FieldInput,
): Promise<Explanation> {
	return 'field' in input
		? decideField(policy, input)
		: decideRest(policy, input);
}
