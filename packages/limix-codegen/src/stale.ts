import {
	type CompiledPolicy,
	compilePolicy,
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
	kind: 'rest' | 'graphql';
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
 * names conditions compiles; a file that does not compile at all is left to
 * `compilePolicy` and judged by nothing here.
 */
export function staleRules(rules: Rules, input: StaleInput): StaleIssue[] {
	const rest = input.rest ?? [];
	const graphql = input.graphql ?? [];
	if (rest.length === 0 && graphql.length === 0) return [];
	const conditions = Object.fromEntries(
		rulesNames(rules).conditions.map((name) => [name, () => true]),
	);
	let policy: CompiledPolicy;
	try {
		// The generated `Register` of the program may narrow `conditions`: the
		// names come from this very file.
		policy = compilePolicy(rules, { conditions } as never);
	} catch (error) {
		if (error instanceof RulesError) return [];
		throw error;
	}
	const issues: StaleIssue[] = [];
	const at = `${input.sources.rules}:`;
	const types = new Set(graphql.map((operation) => operation.type));
	for (const stale of coverage(policy, [...rest, ...graphql]).stale) {
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
