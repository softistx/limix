import type { ConditionMap, Register } from '../register';
import type { Rules } from '../schema';
import type { GraphqlRule, RestRule } from '../types';
import type { RouteMatcher } from './matcher';

/** What a condition is asked about. REST fills `request` and `info`; GraphQL fills `args`, `source` and `info`. */
export interface ConditionContext {
	claims: Readonly<Record<string, unknown>>;
	request?: unknown;
	args?: unknown;
	source?: unknown;
	info?: unknown;
}

/** A predicate registered in code and named by `when`. */
export type Condition = (
	context: ConditionContext,
) => boolean | Promise<boolean>;

/** `T` with every property and list readonly, however deep. Types only. */
type DeepReadonly<T> = T extends (infer U)[]
	? readonly DeepReadonly<U>[]
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

export interface CompiledRestRoute {
	/** The basePath-prefixed pattern. */
	readonly pattern: string;
	/** The method the rule names, or `*` for any. */
	readonly method: string;
	/** Where the rule is written, as an issue path: `rest['POST /a']` or `rest['/a'].POST`. */
	readonly where: string;
	readonly matcher: RouteMatcher;
	readonly rule: DeepReadonly<RestRule>;
	/** The conditions named by `when`, resolved, in order. */
	readonly conditions: readonly Condition[];
	/** True when a relation term reads `json.<path>`, so the body must be buffered. */
	readonly readsBody: boolean;
}

export interface CompiledGraphqlEntry {
	/** Where the rule is written, as an issue path: `graphql['Query.me']` or `graphql.Query.me`. */
	readonly where: string;
	/** True for a `Type.*` rule: it stands for every field of the type with no rule of its own. */
	readonly wildcard: boolean;
	readonly rule: DeepReadonly<GraphqlRule>;
	readonly conditions: readonly Condition[];
}

/**
 * What `compilePolicy` returns: immutable, because integrations cache their
 * fit checks by its identity. Only `global` and `usesRelations` are for hosts;
 * the other fields are read by the limix integrations and may change in a minor
 * release.
 */
export interface CompiledPolicy {
	readonly global: Readonly<Rules['global']>;
	/** Every REST rule once, in document order: what a report per rule iterates. */
	readonly restRoutes: readonly CompiledRestRoute[];
	/**
	 * Routes by HTTP method, each list in document order (first match wins). A
	 * rule for method `*` is in every method's list (unless an exact rule of the
	 * same pattern takes its place there) and, alone, under the key `*`, which a
	 * method outside the usual ten faces.
	 */
	readonly restRoutesByMethod: ReadonlyMap<
		string,
		readonly CompiledRestRoute[]
	>;
	/** GraphQL rules by type, then field; a `Type.*` rule is under the field `*`. */
	readonly graphql?: Readonly<
		Record<string, Readonly<Record<string, CompiledGraphqlEntry>>>
	>;
	/**
	 * True when any rule declares relations: an integration throws at setup when
	 * this holds and it was given no `RelationChecker`, rather than answering 503
	 * to every request that reaches such a rule.
	 */
	readonly usesRelations: boolean;
}

export interface CompileOptions<R = Register> {
	/** The predicates `when` may name, by name (the registered names, when `Register` holds them). */
	conditions?: ConditionMap<R>;
}
