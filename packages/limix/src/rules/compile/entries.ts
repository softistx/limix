import { formatPath, type RulesIssue } from '../error';
import {
	FLAT_GRAPHQL_KEY,
	FLAT_REST_KEY,
	graphqlKeyProblem,
	REST_METHODS,
	restKeyProblem,
} from '../keys';
import type { Rules } from '../schema';
import type { GraphqlRule, RestMethodName, RestRule } from '../types';

/** One REST rule, however its key was spelled. */
export interface RestEntry {
	/** The pattern as written, without the `global.basePath`. */
	pattern: string;
	/** The method the rule names, `*` for any. */
	method: RestMethodName | '*';
	rule: RestRule;
	/** Where the rule is in the document: `['rest', 'POST /a']` or `['rest', '/a', 'POST']`. */
	where: PropertyKey[];
}

/** One GraphQL rule, however its key was spelled. */
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
 * Every REST rule of the document in document order, flat keys
 * (`"POST /a"`) and nested ones (`"/a": { POST }`) interleaved as written.
 * What cannot be read as a rule (a bad key, a rule under a path pattern, a
 * rule named twice) is recorded in `issues` and left out.
 */
export function restEntries(rules: Rules, issues: RulesIssue[]): RestEntry[] {
	const entries: RestEntry[] = [];
	const duplicate = duplicates(issues);
	const add = (
		pattern: string,
		method: RestMethodName | '*',
		rule: RestRule,
		where: PropertyKey[],
	) => {
		const name = `${method} ${normalisePattern(pattern)}`;
		if (duplicate(name, where)) return;
		entries.push({ pattern, method, rule, where });
	};
	for (const [key, value] of Object.entries(rules.rest ?? {})) {
		const problem = restKeyProblem(key);
		if (problem) {
			issues.push({ path: formatPath(['rest', key]), message: problem });
		} else if (FLAT_REST_KEY.test(key)) {
			if (!value) continue;
			const space = key.indexOf(' ');
			add(
				key.slice(space + 1),
				key.slice(0, space) as RestMethodName | '*',
				value as RestRule,
				['rest', key],
			);
		} else if (
			!isObject(value) ||
			Object.keys(value).some((m) => !METHODS.has(m))
		) {
			issues.push({
				path: formatPath(['rest', key]),
				message: `\`${key}\` is a path pattern, so its value is keyed by method; write "GET ${key}" for a single rule`,
			});
		} else {
			for (const [method, rule] of Object.entries(value)) {
				if (!rule) continue;
				add(key, method as RestMethodName | '*', rule as RestRule, [
					'rest',
					key,
					method,
				]);
			}
		}
	}
	return entries;
}

/**
 * Every GraphQL rule of the document in document order, `"Type.field"` and
 * `"Type.*"` keys and nested ones (`Type: { field }`) interleaved as written,
 * with the problems recorded as `restEntries` does.
 */
export function graphqlEntries(
	rules: Rules,
	issues: RulesIssue[],
): GraphqlEntry[] {
	const entries: GraphqlEntry[] = [];
	const duplicate = duplicates(issues);
	const add = (
		type: string,
		field: string,
		rule: GraphqlRule,
		where: PropertyKey[],
	) => {
		const name = `${type}.${field}`;
		if (duplicate(name, where)) return;
		entries.push({ type, field, rule, where });
	};
	for (const [key, value] of Object.entries(rules.graphql ?? {})) {
		const problem = graphqlKeyProblem(key);
		if (problem) {
			issues.push({ path: formatPath(['graphql', key]), message: problem });
		} else if (FLAT_GRAPHQL_KEY.test(key)) {
			if (!value) continue;
			const dot = key.indexOf('.');
			add(key.slice(0, dot), key.slice(dot + 1), value as GraphqlRule, [
				'graphql',
				key,
			]);
		} else if (value === undefined) {
		} else if (!isObject(value) || !Object.values(value).every(isObject)) {
			issues.push({
				path: formatPath(['graphql', key]),
				message: `\`${key}\` is a type, so its value is keyed by field name; write "${key}.field" for a single rule`,
			});
		} else {
			for (const [field, rule] of Object.entries(value)) {
				add(key, field, rule as GraphqlRule, ['graphql', key, field]);
			}
		}
	}
	return entries;
}
