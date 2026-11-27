import {
	type CompiledPolicy,
	type ConditionMap,
	compilePolicy,
	type Register,
	type Rules,
	RulesError,
} from '@softistx/limix';
import {
	coverage,
	type GraphqlOperation,
	type RestOperation,
	type StaleRule,
} from '@softistx/limix/coverage';
import { rulesNames } from './names';

/** What `staleRules` judges the rules against, and how it names each input. */
export interface StaleInput {
	/** The operations of the OpenAPI input; REST rules are judged only when it is given. */
	rest?: readonly RestOperation[] | undefined;
	/** The operations of the GraphQL input; GraphQL rules are judged only when it is given. */
	graphql?: readonly GraphqlOperation[] | undefined;
	/** The inputs as the command line named them (several files joined by `, `). */
	sources: { rules: string; openapi: string; graphql: string };
}

/** A rule that reaches nothing, as one line for the reader. */
export interface StaleIssue {
	/** `compile`: the file does not compile, so nothing was judged. */
	kind: 'rest' | 'graphql' | 'compile';
	/** Where the rule is written: `rest['GET /notes']`, `rest['/notes'].GET`, `graphql['Query.me']`. */
	where: string;
	message: string;
}

const restWhere = (policy: CompiledPolicy, stale: StaleRule): string => {
	const base = policy.global.basePath ?? '';
	const route = policy.restRoutes.find(
		(r) =>
			stale.kind === 'rest' &&
			r.method === stale.method &&
			r.pattern.slice(base.length) === stale.path,
	);
	return route?.where ?? stale.label;
};

/**
 * The rules of a file that reach no operation of the API. Matching is
 * `coverage`'s (the lookup a request takes: basePath, `HEAD` as `GET`, the
 * method `*`, the earlier rule that shadows a later one), not a copy of it.
 *
 * Judged per input: REST rules only when OpenAPI operations are given, GraphQL
 * rules only when GraphQL ones are. A condition name is stubbed so a file that
 * names conditions compiles; a file that does not compile at all is reported as
 * one `compile` issue and judged by nothing else. A `HEAD` rule is reached by a
 * `GET` operation, which a server answers `HEAD` for.
 */
export function staleRules(rules: Rules, input: StaleInput): StaleIssue[] {
	const rest = input.rest ?? [];
	const graphql = input.graphql ?? [];
	if (rest.length === 0 && graphql.length === 0) return [];
	// The program's `Register` may narrow the names; these come from this file.
	const conditions: ConditionMap<Register> = Object.fromEntries(
		rulesNames(rules).conditions.map((name) => [name, () => true]),
	) as ConditionMap<Register>;
	let policy: CompiledPolicy;
	try {
		policy = compilePolicy(rules, { conditions });
	} catch (error) {
		if (!(error instanceof RulesError)) throw error;
		return [
			{
				kind: 'compile',
				where: input.sources.rules,
				message: `${input.sources.rules} does not compile, its rules were not judged: ${error.message}`,
			},
		];
	}
	const issues: StaleIssue[] = [];
	const at = `${input.sources.rules}:`;
	const types = new Set(graphql.map((operation) => operation.type));
	// A server answers `HEAD` from the `GET` route, so each `GET` also stands
	// for its `HEAD`: a `HEAD` rule is reached when a `GET` operation matches.
	const heads = rest
		.filter((operation) => operation.method.toUpperCase() === 'GET')
		.map((operation) => ({ ...operation, method: 'HEAD' }));
	for (const stale of coverage(policy, [...rest, ...heads, ...graphql]).stale) {
		if (stale.kind === 'rest') {
			const where = restWhere(policy, stale);
			const message = stale.shadowedBy
				? `${where} is shadowed by ${stale.shadowedBy.label} above it: it never applies`
				: `${where} applies to no operation of ${input.sources.openapi} (no ${
						stale.method === '*' ? '' : `${stale.method} `
					}route matches ${stale.path})`;
			issues.push({ kind: 'rest', where, message: `${at} ${message}` });
			continue;
		}
		// A type the schema lacks is reported below; a `Type.*` on a type that
		// exists only says every field has a rule of its own.
		if (!types.has(stale.type) || stale.field === '*') continue;
		const where = policy.graphql?.[stale.type]?.[stale.field]?.where;
		issues.push({
			kind: 'graphql',
			where: where ?? stale.label,
			message: `${at} ${where ?? stale.label} names no field of ${stale.type} in ${input.sources.graphql}`,
		});
	}
	if (graphql.length > 0) {
		for (const [type, fields] of Object.entries(policy.graphql ?? {})) {
			if (types.has(type)) continue;
			for (const entry of Object.values(fields)) {
				issues.push({
					kind: 'graphql',
					where: entry.where,
					message: `${at} ${entry.where} names no type of ${input.sources.graphql}`,
				});
			}
		}
	}
	return issues;
}
