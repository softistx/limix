import type { Condition } from './compile/types';
import type {
	RelationRung,
	RestMethodName,
	Rules as RulesDocument,
} from './types';

/**
 * The hook module augmentation fills: `rest` and `graphql` (the API's
 * operations, from a file `@softistx/limix-codegen` generates), and
 * `permission`, `role` and `condition` (the names a policy may use, declared by
 * hand), each a union of string literals. Empty by default, so nothing is
 * checked until something registers it.
 */
// biome-ignore lint/suspicious/noEmptyInterface: filled by module augmentation (@softistx/limix-codegen)
export interface Register {}

type Entry<R, K extends string> =
	R extends Record<K, infer V> ? Extract<V, string> : string;

/** The permission names declared in `Register`, else `string`. */
export type Permission<R = Register> = Entry<R, 'permission'>;
/** The role names declared in `Register`, else `string`. */
export type Role<R = Register> = Entry<R, 'role'>;
/** The condition names (`when`) declared in `Register`, else `string`. */
export type ConditionName<R = Register> = Entry<R, 'condition'>;
/** A REST operation of the API as `GET /users/:id`, else `string`. */
export type RestOperationName<R = Register> = Entry<R, 'rest'>;
/** A GraphQL field of the API as `Query.me`, else `string`. */
export type GraphqlOperationName<R = Register> = Entry<R, 'graphql'>;

/**
 * The terms of a rule, its role, permission and condition names narrowed to
 * what is declared (`Role<R>`, `Permission<R>`, `W`). The lists are mutable so
 * that a `TypedRules` stays assignable to `Rules`.
 */
type Body<R, W extends string> = {
	roles?: Role<R>[][] | null | undefined;
	permissions?: Permission<R>[][] | null | undefined;
	when?: W[] | null | undefined;
	authenticated?: boolean | null | undefined;
	public?: boolean | null | undefined;
	relations?: RelationRung[] | undefined;
};

type MethodsOf<B> = { [M in RestMethodName | '*']?: B | undefined };
type FieldsOf<B> = Record<string, B>;

type PathOf<O> = O extends `${string} ${infer P}` ? P : never;
type MethodOf<O, P extends string> = O extends `${infer M} ${P}` ? M : never;
/** A key with a wildcard or an optional group names several routes: accepted unchecked. */
type OpenPattern = `${string}*${string}` | `${string}{${string}`;
type CheckedRest<O extends string, B> = {
	[P in PathOf<O>]?: {
		[M in MethodOf<O, P> & (RestMethodName | '*')]?: B;
	};
} & { [P in OpenPattern]: MethodsOf<B> };
type TypeOf<O> = O extends `${infer T}.${string}` ? T : never;
type FieldOf<O, T extends string> = O extends `${T}.${infer F}` ? F : never;
type CheckedGraphql<O extends string, B> = {
	[T in TypeOf<O>]?: { [F in FieldOf<O, T>]?: B };
};

/**
 * `Rules` (nested only), narrowed where `Register` holds a `rest` or a
 * `graphql` list: a key the list does not hold is refused. The terms of a rule
 * are narrowed to the declared role, permission and condition names.
 *
 * The refusal holds only in an inline object literal: a variable, a spread, an
 * escaped `\*` key or a `{` key is accepted unchecked. A value already typed
 * `Rules` (the output of `parseRules` or `definePolicy`) goes to
 * `compilePolicy` directly.
 */
export type TypedRules<
	R = Register,
	W extends string = ConditionName<R>,
> = Omit<RulesDocument, 'rest' | 'graphql'> & {
	rest?:
		| (R extends Record<'rest', infer O extends string>
				? CheckedRest<O, Body<R, W>>
				: Record<string, MethodsOf<Body<R, W>>>)
		| undefined;
	graphql?:
		| (R extends Record<'graphql', infer O extends string>
				? CheckedGraphql<O, Body<R, W>>
				: Record<string, FieldsOf<Body<R, W>>>)
		| undefined;
};

type CheckedRestInput<O extends string, B> = {
	[P in PathOf<O>]?: {
		[M in (MethodOf<O, P> & RestMethodName) | '*']?: B;
	};
} & { [K in O]?: B } & {
	[P in OpenPattern]: MethodsOf<B> & B;
};
type CheckedGraphqlInput<O extends string, B> = {
	[T in TypeOf<O>]?: { [F in FieldOf<O, T> | '*']?: B };
} & { [K in O | `${TypeOf<O>}.*`]?: B };

/**
 * What `definePolicy` takes: `TypedRules`' way of narrowing, plus the flat keys
 * (`GET /notes`, `Query.me`, `Note.*`), which only `definePolicy` reads. Where
 * `Register` holds a `rest` or a `graphql` list, a flat key the list does not
 * hold is refused, and the method `*` and the field `*` are accepted under a
 * key it holds. A key with a wildcard or an optional group (`* /x`, `/a/*`,
 * `{`) stays unchecked, as in `TypedRules`. Nothing registered, it is the open
 * shape: any nested or flat key.
 *
 * Every `TypedRules` value is assignable to it. The same limit holds: the
 * refusal applies to an inline object literal only, and an `as const` body is
 * refused once names are narrowed (the lists are mutable).
 */
export type TypedRulesInput<
	R = Register,
	W extends string = ConditionName<R>,
> = Omit<RulesDocument, 'rest' | 'graphql'> & {
	rest?: RestRulesInput<R, W> | undefined;
	graphql?: GraphqlRulesInput<R, W> | undefined;
};

/**
 * The `rest` block of a `TypedRulesInput`, on its own: write it in a file and
 * check it there with `satisfies RestRulesInput`, then give it to
 * `definePolicy({ rest: [a, b] })`. A path, method, role, permission or
 * condition the registration does not hold is refused, as in an inline `rest`.
 */
export type RestRulesInput<R = Register, W extends string = ConditionName<R>> =
	R extends Record<'rest', infer O extends string>
		? CheckedRestInput<O, Body<R, W>>
		: Record<string, MethodsOf<Body<R, W>> & Body<R, W>>;

/** The `graphql` block of a `TypedRulesInput`, on its own: see `RestRulesInput`. */
export type GraphqlRulesInput<
	R = Register,
	W extends string = ConditionName<R>,
> =
	R extends Record<'graphql', infer O extends string>
		? CheckedGraphqlInput<O, Body<R, W>>
		: Record<string, FieldsOf<Body<R, W>> | Body<R, W>>;

/**
 * The predicates `compilePolicy` takes: any name when nothing is registered,
 * else only the names declared in `Register` (not every one is required).
 */
export type ConditionMap<R = Register> = [keyof R & 'condition'] extends [never]
	? Readonly<Record<string, Condition>>
	: Readonly<Partial<Record<ConditionName<R>, Condition>>>;
