import { formatPath, RulesError, type RulesIssue } from '../error';
import { REST_METHODS } from '../keys';
import type { Rules } from '../schema';
import {
	checkContradictions,
	checkParams,
	resolveConditions,
	usesRelations,
} from './check';
import { graphqlEntries, normalisePattern, restEntries } from './entries';
import { compileMatcher } from './matcher';
import type {
	CompiledGraphqlEntry,
	CompiledPolicy,
	CompiledRestRoute,
	CompileOptions,
	Condition,
} from './types';

export type {
	CompiledGraphqlEntry,
	CompiledPolicy,
	CompiledRestRoute,
	CompileOptions,
	Condition,
	ConditionContext,
} from './types';

/**
 * Precompiles validated rules once, so the request path scans no document and
 * builds no matcher. `conditions` holds the predicates `when` names: an unknown
 * name, or a contradictory rule, throws a `RulesError` listing every one.
 */
export function compilePolicy(
	rules: Rules,
	options: CompileOptions = {},
): CompiledPolicy {
	const registry = options.conditions ?? {};
	const issues: RulesIssue[] = [];

	const restRoutes = compileRest(rules, registry, issues);
	const graphql = compileGraphql(rules, registry, issues);

	if (issues.length) throw new RulesError(issues);
	return {
		global: rules.global,
		restRoutes,
		restRoutesByMethod: dispatchTable(restRoutes),
		usesRelations:
			restRoutes.some((route) => usesRelations(route.rule)) ||
			Object.values(graphql ?? {}).some((fields) =>
				Object.values(fields).some((entry) => usesRelations(entry.rule)),
			),
		...(graphql ? { graphql } : {}),
	};
}

/** One compiled route per rule, in document order. */
function compileRest(
	rules: Rules,
	registry: Readonly<Record<string, Condition>>,
	issues: RulesIssue[],
): CompiledRestRoute[] {
	const matchers = new Map<
		string,
		ReturnType<typeof compileMatcher> | undefined
	>();
	const routes: CompiledRestRoute[] = [];
	for (const entry of restEntries(rules, issues)) {
		const pattern = rules.global.basePath
			? `${rules.global.basePath}${entry.pattern}`
			: entry.pattern;
		if (!matchers.has(pattern)) {
			try {
				matchers.set(pattern, compileMatcher(pattern));
			} catch (error) {
				matchers.set(pattern, undefined);
				issues.push({
					path: formatPath(entry.where.slice(0, 2)),
					message: `invalid path pattern: ${error instanceof Error ? error.message : String(error)}`,
				});
			}
		}
		const matcher = matchers.get(pattern);
		if (!matcher) continue;
		const where = formatPath(entry.where);
		const { rule } = entry;
		checkContradictions(rule, where, issues);
		checkParams(rule, where, matcher.names, issues);
		routes.push({
			pattern,
			method: entry.method,
			where,
			matcher,
			rule,
			conditions: resolveConditions(rule, where, registry, issues),
			readsBody: Boolean(
				rule.relations?.some((rung) =>
					rung.require.some((alt) =>
						alt.some((term) => term.from?.startsWith('json.')),
					),
				),
			),
		});
	}
	return routes;
}

/**
 * The routes each method faces, in document order. A rule for method `*` is in
 * every method's list, except where an exact rule of the same pattern stands
 * in its place; `*` alone holds the wildcard rules, for a method outside the
 * usual ten.
 */
function dispatchTable(
	routes: readonly CompiledRestRoute[],
): Map<string, CompiledRestRoute[]> {
	const table = new Map<string, CompiledRestRoute[]>();
	const exact = new Set(
		routes
			.filter((route) => route.method !== '*')
			.map((route) => `${route.method} ${normalisePattern(route.pattern)}`),
	);
	for (const method of REST_METHODS) {
		const list = routes.filter(
			(route) =>
				route.method === method ||
				(route.method === '*' &&
					!exact.has(`${method} ${normalisePattern(route.pattern)}`)),
		);
		if (list.length) table.set(method, list);
	}
	const wildcards = routes.filter((route) => route.method === '*');
	if (wildcards.length) table.set('*', wildcards);
	return table;
}

/** The GraphQL table, or `undefined` when the document has no `graphql` block. */
function compileGraphql(
	rules: Rules,
	registry: Readonly<Record<string, Condition>>,
	issues: RulesIssue[],
): CompiledPolicy['graphql'] {
	if (!rules.graphql) return undefined;
	// A type is in the table in the order it first appears, even with no rule yet.
	const types = new Map<string, Map<string, CompiledGraphqlEntry>>();
	for (const type of Object.keys(rules.graphql)) {
		types.set(type, new Map());
	}
	for (const entry of graphqlEntries(rules, issues)) {
		const where = formatPath(entry.where);
		checkContradictions(entry.rule, where, issues);
		types.get(entry.type)?.set(entry.field, {
			where,
			wildcard: entry.field === '*',
			rule: entry.rule,
			conditions: resolveConditions(entry.rule, where, registry, issues),
		});
	}
	return Object.fromEntries(
		[...types].map(([type, fields]) => [type, Object.fromEntries(fields)]),
	);
}
