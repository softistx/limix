/**
 * The rules document as explicit types, so a zod release can never change what
 * the package freezes. `types.spec.ts` holds them mutually assignable with
 * `z.infer<typeof RulesSchema>`, so a schema edit that drifts fails the typecheck.
 */

/** Disjunctive normal form: the outer list is OR, each inner list is AND. */
type Alternatives = string[][];

/** One relation term: the caller must hold `relation` on an object of `type`. */
export type RelationTerm = {
	relation: string;
	type: string;
	/** Where the object id is read from; `param.id` on REST, `args.id` on GraphQL by default. */
	from?: string | undefined;
};

/** One rung of the relations ladder. */
export type RelationRung = {
	require: RelationTerm[][];
	/** How a failure of this rung is answered; `NOT_FOUND` by default. */
	onDeny?: 'NOT_FOUND' | 'FORBIDDEN' | undefined;
	/** The refusal's code, replacing the default one of the answer. */
	code?: string | undefined;
};

type EntryRule = {
	roles?: Alternatives | null | undefined;
	permissions?: Alternatives | null | undefined;
	when?: string[] | null | undefined;
	authenticated?: boolean | null | undefined;
	public?: boolean | null | undefined;
	relations?: RelationRung[] | undefined;
};

/** The rule of one REST route and method. */
export type RestRule = EntryRule;

/** The rule of one GraphQL field. */
export type GraphqlRule = EntryRule;

/** The HTTP methods a path entry may name. */
export type RestMethodName =
	| 'GET'
	| 'POST'
	| 'PUT'
	| 'PATCH'
	| 'DELETE'
	| 'HEAD'
	| 'OPTIONS'
	| 'CONNECT'
	| 'TRACE'
	| 'QUERY';

/** A flat REST key: a method (or `*` for any), one space, the path pattern. */
export type RestFlatKey = `${RestMethodName | '*'} ${string}`;

/** A flat GraphQL key: `Type.field`, or `Type.*` for every field of the type. */
export type GraphqlFlatKey = `${string}.${string}`;

/** The rules of one path pattern, by HTTP method (`*` for any). */
export type RestMethods = {
	[M in RestMethodName | '*']?: RestRule | undefined;
};

/** Rules for the fields of one GraphQL type, by field name (`*` for every other). */
export type GraphqlFields = Record<string, GraphqlRule>;

/** Settings applied across the whole document. */
export type RulesGlobal = {
	basePath?: string | undefined;
	unmatched: 'allow' | 'deny';
};

/**
 * A validated rules document, as `parseRules` and `definePolicy` return it.
 * A key under `rest` is flat (`"POST /users/:id"`, the value a rule) or a path
 * pattern (the value keyed by method); a key under `graphql` is flat
 * (`"Query.me"`, `"Note.*"`, the value a rule) or a type name (the value keyed
 * by field). TypeScript cannot say "not flat" for the other case, so a rule
 * under a path pattern or a type name type-checks and `compilePolicy` refuses it.
 */
export type Rules = {
	limix: 1;
	global: RulesGlobal;
	/** REST rules, in document order. */
	rest?:
		| {
				[key: RestFlatKey]: RestRule;
				[pattern: string]: RestMethods | RestRule;
		  }
		| undefined;
	/** GraphQL rules, in document order. */
	graphql?:
		| {
				Query?: GraphqlFields | undefined;
				Mutation?: GraphqlFields | undefined;
				Subscription?: GraphqlFields | undefined;
				[key: GraphqlFlatKey]: GraphqlRule;
				[type: string]: GraphqlFields | GraphqlRule | undefined;
		  }
		| undefined;
};
