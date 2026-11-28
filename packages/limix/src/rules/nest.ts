import { RulesError, type RulesIssue } from './error';
import { nestGraphql } from './nest-graphql';
import { nestRest } from './nest-rest';
import { isObject, type Origin } from './nest-shared';
import type { Rules } from './types';

export type { Origin };

/** A document as `definePolicy` takes it: flat and nested keys, values not yet validated. */
export type PolicyDocument = {
	limix: 1;
	global: Rules['global'];
	rest?: object | readonly object[] | undefined;
	graphql?: object | readonly object[] | undefined;
};

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
 *
 * `rest` and `graphql` may each be a list of blocks, read in list order as one
 * document; a rule written in two blocks is refused, naming both
 * (`rest[0]['/a'].GET` and `rest[1]['GET /a']`).
 */
export function toNested(input: PolicyDocument): Rules {
	return nestWithOrigins(input).rules;
}

/** The blocks of a `rest` or `graphql` value: itself, or its list. */
const blocksOf = (value: unknown): readonly unknown[] =>
	Array.isArray(value) ? value : [value];

/**
 * `toNested`, and where each flat-written rule went, so that an issue found in
 * the nested document can name the key its author wrote.
 */
export function nestWithOrigins(input: PolicyDocument): {
	rules: Rules;
	origins: Origin[];
} {
	const issues: RulesIssue[] = [];
	const origins: Origin[] = [];
	const out: Record<string, unknown> = { ...input };
	if (Array.isArray(input.rest) || isObject(input.rest)) {
		const listed = Array.isArray(input.rest);
		out['rest'] = nestRest(blocksOf(input.rest), listed, issues, origins);
	}
	if (Array.isArray(input.graphql) || isObject(input.graphql)) {
		const listed = Array.isArray(input.graphql);
		out['graphql'] = nestGraphql(
			blocksOf(input.graphql),
			listed,
			issues,
			origins,
		);
	}
	if (issues.length) throw new RulesError(issues, 'definePolicy');
	return { rules: out as Rules, origins };
}

/** An issue path rewritten to the flat key it was written as, when it was. */
export function writtenPath(path: string, origins: readonly Origin[]): string {
	for (const [nested, written] of origins) {
		if (!path.startsWith(nested)) continue;
		const next = path[nested.length];
		if (next === undefined || next === '.' || next === '[') {
			return written + path.slice(nested.length);
		}
	}
	return path;
}
