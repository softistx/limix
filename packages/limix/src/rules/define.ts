import { RulesError } from './error';
import { nestWithOrigins, type PolicyDocument, writtenPath } from './nest';
import { parseRules } from './parse';
import type {
	ConditionMap,
	ConditionName,
	GraphqlRulesInput,
	Register,
	RestRulesInput,
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

type Names<C> = [C] extends [never] ? ConditionName : keyof C & string;

/**
 * What `definePolicy` takes: a `TypedRulesInput` whose `rest` and `graphql` are
 * each one block or a list of blocks (see `RestRulesInput`).
 */
type DefineInput<C> = Omit<
	TypedRulesInput<Register, Names<C>>,
	'rest' | 'graphql'
> & {
	rest?:
		| RestRulesInput<Register, Names<C>>
		| readonly RestRulesInput<Register, Names<C>>[]
		| undefined;
	graphql?:
		| GraphqlRulesInput<Register, Names<C>>
		| readonly GraphqlRulesInput<Register, Names<C>>[]
		| undefined;
};

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
 *
 * `rest` and `graphql` may each be a list of blocks, so that a policy's rules
 * live in several files, each checked on its own with `satisfies
 * RestRulesInput`. The list is read in order, as one document: list order is
 * document order, so it is the first-match precedence. A rule written in two
 * blocks throws, naming both (`rest[0]['/a'].GET` and `rest[1]['GET /a']`);
 * a spread would overwrite silently.
 */
export function definePolicy<const C extends ConditionMap = never>(
	rules: NoInfer<DefineInput<C>>,
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
