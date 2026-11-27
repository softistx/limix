import { formatPath, RulesError, type RulesIssue } from '../error';
import type { Rules } from '../schema';
import {
	checkContradictions,
	checkParams,
	resolveConditions,
	usesRelations,
} from './check';
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

	const restRoutesByMethod = compileRest(rules, registry, issues);
	const graphql = compileGraphql(rules, registry, issues);

	if (issues.length) throw new RulesError(issues);
	return {
		global: rules.global,
		restRoutesByMethod,
		usesRelations: [
			...restRoutesByMethod.values(),
			...Object.values(graphql ?? {}).map((fields) => Object.values(fields)),
		].some((entries) => entries.some((entry) => usesRelations(entry.rule))),
		...(graphql ? { graphql } : {}),
	};
}

/** The REST table, keyed path -> method in the document, method -> routes for dispatch. */
function compileRest(
	rules: Rules,
	registry: Readonly<Record<string, Condition>>,
	issues: RulesIssue[],
): Map<string, CompiledRestRoute[]> {
	const restRoutesByMethod = new Map<string, CompiledRestRoute[]>();
	for (const [basePattern, methods] of Object.entries(rules.rest ?? {})) {
		const pattern = rules.global.basePath
			? `${rules.global.basePath}${basePattern}`
			: basePattern;
		let matcher: CompiledRestRoute['matcher'];
		let names: ReadonlySet<string>;
		try {
			const compiled = compileMatcher(pattern);
			matcher = compiled;
			names = compiled.names;
		} catch (error) {
			issues.push({
				path: formatPath(['rest', basePattern]),
				message: `invalid path pattern: ${error instanceof Error ? error.message : String(error)}`,
			});
			continue;
		}
		for (const [method, rule] of Object.entries(methods)) {
			if (!rule) continue;
			const where = formatPath(['rest', basePattern, method]);
			checkContradictions(rule, where, issues);
			checkParams(rule, where, names, issues);
			const route: CompiledRestRoute = {
				pattern,
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
			};
			const existing = restRoutesByMethod.get(method);
			if (existing) existing.push(route);
			else restRoutesByMethod.set(method, [route]);
		}
	}
	return restRoutesByMethod;
}

/** The GraphQL table, or `undefined` when the document has no `graphql` block. */
function compileGraphql(
	rules: Rules,
	registry: Readonly<Record<string, Condition>>,
	issues: RulesIssue[],
): CompiledPolicy['graphql'] {
	if (!rules.graphql) return undefined;
	const graphql: Record<
		string,
		Readonly<Record<string, CompiledGraphqlEntry>>
	> = {};
	for (const [type, fields] of Object.entries(rules.graphql)) {
		const compiled: Record<string, CompiledGraphqlEntry> = {};
		for (const [field, rule] of Object.entries(fields ?? {})) {
			const where = formatPath(['graphql', type, field]);
			checkContradictions(rule, where, issues);
			compiled[field] = {
				rule,
				conditions: resolveConditions(rule, where, registry, issues),
			};
		}
		graphql[type] = compiled;
	}
	return graphql;
}
