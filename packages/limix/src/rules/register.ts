import type { Condition } from './compile/types';
import type { Rules } from './schema';
import type { GraphqlRule, RestMethods, RestRule, RulesInput } from './types';

/**
 * The hook a generated file fills by module augmentation
 * (`@softistx/limix-codegen`): `rest`, `graphql`, `permission`, `role` and
 * `condition`, each a union of string literals. Empty by default, so nothing
 * is checked until a generated file registers it.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation (@softistx/limix-codegen)
export interface Register {}

type Entry<R, K extends string> =
	R extends Record<K, infer V> ? Extract<V, string> : string;

/** The permission names the rules file holds, else `string`. */
export type Permission<R = Register> = Entry<R, 'permission'>;
/** The role names the rules file holds, else `string`. */
export type Role<R = Register> = Entry<R, 'role'>;
/** The condition names (`when`) the rules file holds, else `string`. */
export type ConditionName<R = Register> = Entry<R, 'condition'>;
/** A REST operation of the API as `GET /users/:id`, else `string`. */
export type RestOperationName<R = Register> = Entry<R, 'rest'>;
/** A GraphQL field of the API as `Query.me`, else `string`. */
export type GraphqlOperationName<R = Register> = Entry<R, 'graphql'>;

type PathOf<O> = O extends `${string} ${infer P}` ? P : never;
type MethodOf<O, P extends string> = O extends `${infer M} ${P}` ? M : never;
/**
 * A key with a wildcard or an optional group names several routes: accepted
 * unchecked. Its value is typed as both a method map and a rule, so that a
 * flat key holding a `*` stays assignable to `Rules`.
 */
type OpenPattern = `${string}*${string}` | `${string}{${string}`;
type CheckedRest<O extends string> = {
	[P in PathOf<O>]?: {
		[M in MethodOf<O, P> & keyof RestMethods]?: RestRule;
	};
} & { [P in OpenPattern]: RestMethods & RestRule };
type TypeOf<O> = O extends `${infer T}.${string}` ? T : never;
type FieldOf<O, T extends string> = O extends `${T}.${infer F}` ? F : never;
type CheckedGraphql<O extends string> = {
	[T in TypeOf<O>]?: { [F in FieldOf<O, T>]?: GraphqlRule };
};

/**
 * `Rules`, narrowed where `Register` holds a `rest` or a `graphql` list: a key
 * the list does not hold is refused. Unregistered, it is `RulesInput`.
 *
 * The refusal holds only in an inline object literal: a variable, a spread, an
 * escaped `\*` key or a `{` key is accepted unchecked. A value already typed
 * `Rules` (the output of `parseRules`) goes to `compilePolicy` directly, not
 * through `definePolicy`.
 */
export type TypedRules<R = Register> = [
	keyof R & ('rest' | 'graphql'),
] extends [never]
	? RulesInput
	: Omit<Rules, 'rest' | 'graphql'> & {
			rest?:
				| (R extends Record<'rest', infer O extends string>
						? CheckedRest<O>
						: Rules['rest'])
				| undefined;
			graphql?:
				| (R extends Record<'graphql', infer O extends string>
						? CheckedGraphql<O>
						: Rules['graphql'])
				| undefined;
		};

type CheckedRestInput<O extends string> = {
	[P in PathOf<O>]?: {
		[M in (MethodOf<O, P> & keyof RestMethods) | '*']?: RestRule;
	};
} & { [K in O]?: RestRule } & {
	[P in OpenPattern]: RestMethods & RestRule;
};
type CheckedGraphqlInput<O extends string> = {
	[T in TypeOf<O>]?: { [F in FieldOf<O, T> | '*']?: GraphqlRule };
} & { [K in O | `${TypeOf<O>}.*`]?: GraphqlRule };

/**
 * What `definePolicy` takes: `TypedRules`' way of narrowing, over `RulesInput`
 * instead of `Rules`. Where `Register` holds a `rest` or a `graphql` list, a
 * flat key (`GET /notes`, `Query.me`, `Note.*`) the list does not hold is
 * refused, and the method `*` and the field `*` are accepted under a key it
 * holds. A key with a wildcard or an optional group (`* /x`, `/a/*`, `{`)
 * stays unchecked, as in `TypedRules`. Unregistered, it is `RulesInput`.
 *
 * Every `TypedRules` value is assignable to it. The same limit holds: the
 * refusal applies to an inline object literal only.
 */
export type TypedRulesInput<R = Register> = [
	keyof R & ('rest' | 'graphql'),
] extends [never]
	? RulesInput
	: Omit<RulesInput, 'rest' | 'graphql'> & {
			rest?:
				| (R extends Record<'rest', infer O extends string>
						? CheckedRestInput<O>
						: RulesInput['rest'])
				| undefined;
			graphql?:
				| (R extends Record<'graphql', infer O extends string>
						? CheckedGraphqlInput<O>
						: RulesInput['graphql'])
				| undefined;
		};

/**
 * The predicates `compilePolicy` takes: any name when nothing is registered,
 * else only the names the rules file holds (not every one is required).
 */
export type ConditionMap<R = Register> = [keyof R & 'condition'] extends [never]
	? Readonly<Record<string, Condition>>
	: Readonly<Partial<Record<ConditionName<R>, Condition>>>;
