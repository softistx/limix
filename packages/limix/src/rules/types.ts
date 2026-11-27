/**
 * The rules document as explicit types, so a zod release can never change what
 * the package freezes. `types.spec.ts` holds them mutually assignable with
 * `z.infer<typeof RulesSchema>`, so a schema edit that drifts fails the typecheck.
 */

/** Disjunctive normal form: the outer list is OR, each inner list is AND. */
type Alternatives = string[][];

/** One relation term: the caller must hold `relation` on an object of `type`. */
export interface RelationTerm {
	relation: string;
	type: string;
	/** Where the object id is read from; `param.id` on REST, `args.id` on GraphQL by default. */
	from?: string | undefined;
}

/** One rung of the relations ladder. */
export interface RelationRung {
	require: RelationTerm[][];
	/** How a failure of this rung is answered; `NOT_FOUND` by default. */
	onDeny?: 'NOT_FOUND' | 'FORBIDDEN' | undefined;
	/** The refusal's code, replacing the default one of the answer. */
	code?: string | undefined;
}

interface EntryRule {
	roles?: Alternatives | null | undefined;
	permissions?: Alternatives | null | undefined;
	when?: string[] | null | undefined;
	authenticated?: boolean | null | undefined;
	public?: boolean | null | undefined;
	relations?: RelationRung[] | undefined;
}

/** The rule of one REST route and method. */
export interface RestRule extends EntryRule {}

/** The rule of one GraphQL field. */
export interface GraphqlRule extends EntryRule {}

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

/** The rules of one path pattern, by HTTP method. */
export type RestMethods = { [M in RestMethodName]?: RestRule | undefined };

/** Rules for the fields of one GraphQL type, by field name. */
export type GraphqlFields = Record<string, GraphqlRule>;

/** Settings applied across the whole document. */
export interface RulesGlobal {
	basePath?: string | undefined;
	unmatched: 'allow' | 'deny';
}

/** A validated rules document, as `parseRules` and `definePolicy` return it. */
export interface Rules {
	limix: 1;
	global: RulesGlobal;
	/** REST rules by path pattern, then HTTP method, in document order. */
	rest?: Record<string, RestMethods> | undefined;
	/** GraphQL rules by type name, then field name. */
	graphql?:
		| ({
				Query?: GraphqlFields | undefined;
				Mutation?: GraphqlFields | undefined;
				Subscription?: GraphqlFields | undefined;
		  } & Record<string, GraphqlFields>)
		| undefined;
}
