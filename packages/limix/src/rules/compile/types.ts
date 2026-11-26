import type { MatchFunction } from 'path-to-regexp';
import type { GraphqlRule } from '../graphql';
import type { RestRule } from '../rest';
import type { Rules } from '../schema';

/** What a condition is asked about. REST fills `request`; GraphQL fills `args`, `source` and `info`. */
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

export interface CompiledRestRoute {
	/** The basePath-prefixed pattern. */
	pattern: string;
	matcher: MatchFunction<Partial<Record<string, string | string[]>>>;
	rule: RestRule;
	/** The conditions named by `when`, resolved, in order. */
	conditions: readonly Condition[];
	/** True when a relation term reads `json.<path>`, so the body must be buffered. */
	readsBody: boolean;
}

export interface CompiledGraphqlEntry {
	rule: GraphqlRule;
	conditions: readonly Condition[];
}

export interface CompiledPolicy {
	global: Rules['global'];
	/** Routes by HTTP method, each list in document order (first match wins). */
	restRoutesByMethod: Map<string, CompiledRestRoute[]>;
	graphql?: Record<string, Record<string, CompiledGraphqlEntry>>;
}

export interface CompileOptions {
	/** The predicates `when` may name, by name. */
	conditions?: Readonly<Record<string, Condition>>;
}
