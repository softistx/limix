import { match } from 'path-to-regexp';
import { formatPath, RulesError, type RulesIssue } from '../error';
import type { Rules } from '../schema';
import { checkContradictions, resolveConditions } from './check';
import type {
	CompiledGraphqlEntry,
	CompiledPolicy,
	CompiledRestRoute,
	CompileOptions,
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

	// The document is keyed path -> method; dispatch wants method -> routes.
	const restRoutesByMethod = new Map<string, CompiledRestRoute[]>();
	for (const [basePattern, methods] of Object.entries(rules.rest ?? {})) {
		const pattern = rules.global.basePath
			? `${rules.global.basePath}${basePattern}`
			: basePattern;
		const matcher = match(pattern, { decode: decodeURIComponent });
		for (const [method, rule] of Object.entries(methods)) {
			if (!rule) continue;
			const where = formatPath(['rest', basePattern, method]);
			checkContradictions(rule, where, issues);
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

	let graphql: CompiledPolicy['graphql'];
	if (rules.graphql) {
		graphql = {};
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
	}

	if (issues.length) throw new RulesError(issues);
	return {
		global: rules.global,
		restRoutesByMethod,
		...(graphql ? { graphql } : {}),
	};
}
