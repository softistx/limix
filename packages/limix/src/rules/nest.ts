import { formatPath, RulesError, type RulesIssue } from './error';
import {
	FLAT_GRAPHQL_KEY,
	FLAT_REST_KEY,
	splitFlatGraphql,
	splitFlatRest,
} from './keys';
import type { Rules } from './types';

/** A document as `definePolicy` takes it: flat and nested keys, values not yet validated. */
export type PolicyDocument = {
	limix: 1;
	global: Rules['global'];
	rest?: object | undefined;
	graphql?: object | undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a rule of method `a` and one of method `b` could answer the same
 * request: the same method, either one `*`, or a GET and a HEAD (a HEAD
 * request faces the GET rules). No pattern overlap is computed, so the answer
 * is a conservative one.
 */
function compete(a: string, b: string): boolean {
	return (
		a === b ||
		a === '*' ||
		b === '*' ||
		(a === 'GET' && b === 'HEAD') ||
		(a === 'HEAD' && b === 'GET')
	);
}

const duplicate = (
	first: PropertyKey[],
	second: PropertyKey[],
	name: string,
): RulesIssue => ({
	path: formatPath(second),
	message: `duplicate rule: ${formatPath(first)} and ${formatPath(second)} both name ${name}`,
});

/**
 * Turns the flat keys of a `definePolicy` document (`"POST /users/:id"`,
 * `"Query.me"`, `"Note.*"`) into the nested ones the rules format holds, in
 * document order: a flat key goes under its path (or type); when that key
 * already exists, the rule joins it, moving up to where the key was first
 * written.
 *
 * REST rules are first-match, so a move is refused when it would jump over a
 * rule that could answer the same request (see `compete`). GraphQL rules are
 * not first-match: they are grouped by type. A rule written twice is refused.
 * Throws a `RulesError` listing every problem.
 */
export function toNested(input: PolicyDocument): Rules {
	const issues: RulesIssue[] = [];
	const out: Record<string, unknown> = { ...input };
	if (isObject(input.rest)) out['rest'] = nestRest(input.rest, issues);
	if (isObject(input.graphql)) {
		out['graphql'] = nestGraphql(input.graphql, issues);
	}
	if (issues.length) throw new RulesError(issues, 'definePolicy');
	return out as Rules;
}

/** One group of the output: a path with the rules it holds by method, and where each was written. */
type Group = {
	rules: Map<string, unknown>;
	written: Map<string, PropertyKey[]>;
};

function nestRest(rest: Record<string, unknown>, issues: RulesIssue[]) {
	const groups = new Map<string, Group>();
	const passed = new Map<string, unknown>();
	const place = (
		pattern: string,
		method: string,
		rule: unknown,
		where: PropertyKey[],
	) => {
		const existing = groups.get(pattern);
		if (!existing) {
			groups.set(pattern, {
				rules: new Map([[method, rule]]),
				written: new Map([[method, where]]),
			});
			return;
		}
		const first = existing.written.get(method);
		if (first) {
			issues.push(duplicate(first, where, `${method} ${pattern}`));
			return;
		}
		const keys = [...groups.keys()];
		const jumped = keys
			.slice(keys.indexOf(pattern) + 1)
			.flatMap((other) =>
				[...(groups.get(other)?.rules.keys() ?? [])].map(
					(m) => [other, m] as const,
				),
			)
			.find(([, m]) => compete(method, m));
		if (jumped) {
			issues.push({
				path: formatPath(where),
				message: `\`${method} ${pattern}\` would move above \`${jumped[1]} ${jumped[0]}\`: nest it under \`${pattern}\`, or write \`${jumped[0]}\` after it`,
			});
			return;
		}
		existing.rules.set(method, rule);
		existing.written.set(method, where);
	};
	for (const [key, value] of Object.entries(rest)) {
		if (value === undefined) continue;
		if (FLAT_REST_KEY.test(key)) {
			const { method, pattern } = splitFlatRest(key);
			place(pattern, method, value, ['rest', key]);
		} else if (isObject(value)) {
			// A group is registered even when empty, so that a later flat key joins it.
			if (!groups.has(key)) {
				groups.set(key, { rules: new Map(), written: new Map() });
			}
			for (const [method, rule] of Object.entries(value)) {
				if (rule !== undefined) place(key, method, rule, ['rest', key, method]);
			}
		} else {
			passed.set(key, value);
		}
	}
	return Object.fromEntries([
		...[...groups].map(
			([pattern, group]) => [pattern, Object.fromEntries(group.rules)] as const,
		),
		...passed,
	]);
}

function nestGraphql(graphql: Record<string, unknown>, issues: RulesIssue[]) {
	const types = new Map<string, Map<string, unknown>>();
	const written = new Map<string, PropertyKey[]>();
	const passed = new Map<string, unknown>();
	const place = (
		type: string,
		field: string,
		rule: unknown,
		where: PropertyKey[],
	) => {
		const fields = types.get(type) ?? new Map<string, unknown>();
		types.set(type, fields);
		const name = `${type}.${field}`;
		const first = written.get(name);
		if (first) {
			issues.push(duplicate(first, where, name));
			return;
		}
		written.set(name, where);
		fields.set(field, rule);
	};
	for (const [key, value] of Object.entries(graphql)) {
		if (value === undefined) continue;
		if (FLAT_GRAPHQL_KEY.test(key)) {
			const { type, field } = splitFlatGraphql(key);
			place(type, field, value, ['graphql', key]);
		} else if (isObject(value)) {
			if (!types.has(key)) types.set(key, new Map());
			for (const [field, rule] of Object.entries(value)) {
				if (rule !== undefined)
					place(key, field, rule, ['graphql', key, field]);
			}
		} else {
			passed.set(key, value);
		}
	}
	return Object.fromEntries([
		...[...types].map(
			([type, fields]) => [type, Object.fromEntries(fields)] as const,
		),
		...passed,
	]);
}
