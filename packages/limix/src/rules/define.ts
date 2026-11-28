import { RulesError } from './error';
import { nestWithOrigins, type PolicyDocument, writtenPath } from './nest';
import { parseRules } from './parse';
import type {
	ConditionMap,
	ConditionName,
	Register,
	TypedRulesInput,
} from './register';
import type { Rules } from './schema';

/** What `definePolicy` takes beside the rules: types only, nothing here runs. */
export interface DefinePolicyOptions<C> {
	/**
	 * The conditions `when` may name. Pass the same object to
	 * `compilePolicy({ conditions })`: `definePolicy` only reads its keys, to
	 * type `when`, and never calls a condition.
	 */
	conditions?: C;
}

/**
 * Writes a policy in code. A flat key (`"POST /users/:id"`, `"Query.me"`,
 * `"Note.*"`) is accepted here and nowhere else: it is nested under its path or
 * type, in document order, then the document is validated as `parseRules`
 * would, so what comes back is the same nested `Rules`, which `compilePolicy`
 * takes. It throws a `RulesError` for an invalid document, a rule written twice,
 * or a flat rule whose move up to an earlier path would jump over a rule that
 * could answer the same request.
 *
 * At compile time `rules` must be a valid document: a typo in a key, a method
 * or an enum value fails to compile. Once a generated file registers the API's
 * operations (`Register`, see `@softistx/limix-codegen`), a path, method, type
 * or field the list does not hold is refused too, a flat key included; and the
 * role, permission and condition names a `Register` declares narrow `roles`,
 * `permissions` and `when`. The condition names come from `options.conditions`
 * (or an explicit `definePolicy<typeof conditions>(...)`), else from
 * `Register`. A key with a wildcard (`* /x`, `/a/*`) or an optional group stays
 * unchecked.
 */
export function definePolicy<const C extends ConditionMap = never>(
	rules: NoInfer<
		TypedRulesInput<
			Register,
			[C] extends [never] ? ConditionName : keyof C & string
		>
	>,
	// Types only: the argument is never read.
	_options?: DefinePolicyOptions<C>,
): Rules {
	const { rules: nested, origins } = nestWithOrigins(
		rules as unknown as PolicyDocument,
	);
	try {
		return parseRules(nested, 'definePolicy');
	} catch (error) {
		if (!(error instanceof RulesError) || origins.length === 0) throw error;
		// Name the key the author wrote (`rest['GET /a'].roles`), not its nested place.
		throw new RulesError(
			error.issues.map((issue) => ({
				...issue,
				path: writtenPath(issue.path, origins),
			})),
			'definePolicy',
		);
	}
}
