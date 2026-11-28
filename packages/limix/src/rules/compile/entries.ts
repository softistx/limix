import { formatPath, type RulesIssue } from '../error';
import { flatKeyProblem, REST_METHODS } from '../keys';
import type { Rules } from '../schema';
import type { GraphqlRule, RestMethodName, RestRule } from '../types';

const RULE_TERMS = new Set([
	'roles',
	'permissions',
	'relations',
	'when',
	'authenticated',
	'public',
]);

/**
 * Whether `rule` is a rule: a key that is no rule term (a method map under a
 * flat key, say) would compile to a rule with no requirement, which allows
 * everyone, so it is recorded as an issue instead.
 */
function isRule(rule: unknown, where: PropertyKey[], issues: RulesIssue[]) {
	if (!isObject(rule)) return true;
	const stray = Object.keys(rule).find((key) => !RULE_TERMS.has(key));
	if (stray === undefined) return true;
	const path = formatPath(where);
	issues.push({
		path,
		message: `a rule's keys are rule terms (roles, permissions, relations, when, authenticated, public); \`${stray}\` is not one`,
	});
	return false;
}

/** One REST rule. */
export interface RestEntry {
	/** The pattern as written, without the `global.basePath`. */
	pattern: string;
	/** The method the rule names, `*` for any. */
	method: RestMethodName | '*';
	rule: RestRule;
	/** Where the rule is in the document: `['rest', 'POST /a']` or `['rest', '/a', 'POST']`. */
	where: PropertyKey[];
}

/** One GraphQL rule. */
export interface GraphqlEntry {
	type: string;
	/** A field name, or `*` for every field of the type with no rule of its own. */
	field: string;
	rule: GraphqlRule;
	where: PropertyKey[];
}

const METHODS: ReadonlySet<string> = new Set([...REST_METHODS, '*']);

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A pattern as a rule names it: one trailing slash is no difference. */
export const normalisePattern = (pattern: string): string =>
	pattern.length > 1 && pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;

/** Remembers the rules seen, so that a second one naming the same thing is a duplicate. */
function duplicates(issues: RulesIssue[]) {
	const seen = new Map<string, PropertyKey[]>();
	return (name: string, where: PropertyKey[]): boolean => {
		const first = seen.get(name);
		if (!first) {
			seen.set(name, where);
			return false;
		}
		issues.push({
			path: formatPath(where),
			message: `duplicate rule: ${formatPath(first)} and ${formatPath(where)} both name ${name}`,
		});
		return true;
	};
}

/**
 * Every REST rule of the document in document order. What cannot be read as a
 * rule (a rule under a path pattern, a rule named twice) is recorded in
 * `issues` and left out.
 */
export function restEntries(rules: Rules, issues: RulesIssue[]): RestEntry[] {
	const entries: RestEntry[] = [];
	const duplicate = duplicates(issues);
	for (const [pattern, value] of Object.entries(rules.rest ?? {})) {
		const flat = flatKeyProblem('rest', pattern);
		if (flat) {
			issues.push({ path: formatPath(['rest', pattern]), message: flat });
			continue;
		}
		if (
			!isObject(value) ||
			Object.keys(value).some((method) => !METHODS.has(method))
		) {
			issues.push({
				path: formatPath(['rest', pattern]),
				message: `\`${pattern}\` is a path pattern, so its value is keyed by method (for example GET: {...})`,
			});
			continue;
		}
		for (const [method, rule] of Object.entries(value)) {
			if (!rule) continue;
			const where = ['rest', pattern, method];
			const name = `${method} ${normalisePattern(pattern)}`;
			if (duplicate(name, where) || !isRule(rule, where, issues)) continue;
			entries.push({
				pattern,
				method: method as RestMethodName | '*',
				rule: rule as RestRule,
				where,
			});
		}
	}
	return entries;
}

/**
 * Every GraphQL rule of the document in document order, with the problems
 * recorded as `restEntries` does.
 */
export function graphqlEntries(
	rules: Rules,
	issues: RulesIssue[],
): GraphqlEntry[] {
	const entries: GraphqlEntry[] = [];
	for (const [type, value] of Object.entries(rules.graphql ?? {})) {
		if (value === undefined) continue;
		const flat = flatKeyProblem('graphql', type);
		if (flat) {
			issues.push({ path: formatPath(['graphql', type]), message: flat });
			continue;
		}
		if (!isObject(value) || !Object.values(value).every(isObject)) {
			issues.push({
				path: formatPath(['graphql', type]),
				message: `\`${type}\` is a type, so its value is keyed by field name (for example me: {...})`,
			});
			continue;
		}
		for (const [field, rule] of Object.entries(value)) {
			const where = ['graphql', type, field];
			if (!isRule(rule, where, issues)) continue;
			entries.push({ type, field, rule: rule as GraphqlRule, where });
		}
	}
	return entries;
}
