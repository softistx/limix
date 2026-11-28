import { compilePolicy, definePolicy } from '@softistx/limix';
import type { Operation } from '@softistx/limix/coverage';
import { CodegenError } from './errors';
import { quote } from './module';
import { compareText, METHODS } from './order';

const NOTE =
	'// Written once by limix-codegen init: every operation needs a signed-in caller until you write its rule.';

type Rule = { authenticated: true };
/** A section: a key and a rule per method or field (nested), or a rule per flat key. */
type Section = Record<string, Rule | Record<string, Rule>>;

const RULE: Rule = { authenticated: true };

/** 0 static, 1 holds a `:` capture, 2 holds a `*` wildcard; escaped characters are text. */
function segmentRank(segment: string): number {
	let rank = 0;
	for (let i = 0; i < segment.length; i++) {
		const char = segment[i];
		if (char === '\\') i++;
		else if (char === '*') return 2;
		else if (char === ':') rank = 1;
	}
	return rank;
}

/**
 * Paths segment by segment: a static segment before a capture, a capture before
 * a wildcard, ties by code unit. A rules file is first-match, so `/notes/new`
 * must precede `/notes/:id`.
 */
export function comparePaths(a: string, b: string): number {
	const left = a.split('/');
	const right = b.split('/');
	for (let i = 0; i < Math.min(left.length, right.length); i++) {
		const x = left[i] ?? '';
		const y = right[i] ?? '';
		const byRank = segmentRank(x) - segmentRank(y);
		if (byRank !== 0) return byRank;
		const byText = compareText(x, y);
		if (byText !== 0) return byText;
	}
	return left.length - right.length;
}

function restDocument(
	operations: readonly Operation[],
): Record<string, Record<string, Rule>> {
	const methods = new Map<string, Set<string>>();
	for (const operation of operations) {
		if (operation.kind !== 'rest') continue;
		const set = methods.get(operation.path) ?? new Set<string>();
		set.add(operation.method.toUpperCase());
		methods.set(operation.path, set);
	}
	const out: Record<string, Record<string, Rule>> = {};
	for (const path of [...methods.keys()].sort(comparePaths)) {
		const set = methods.get(path) ?? new Set<string>();
		const known = METHODS.filter((method) => set.has(method));
		out[path] = Object.fromEntries(known.map((method) => [method, RULE]));
	}
	return out;
}

function graphqlDocument(
	operations: readonly Operation[],
): Record<string, Record<string, Rule>> {
	const types = new Map<string, Set<string>>();
	for (const operation of operations) {
		if (operation.kind !== 'graphql' || !operation.root) continue;
		const set = types.get(operation.type) ?? new Set<string>();
		set.add(operation.field);
		types.set(operation.type, set);
	}
	const out: Record<string, Record<string, Rule>> = {};
	for (const [type, fields] of types) {
		out[type] = Object.fromEntries(
			[...fields].sort(compareText).map((field) => [field, RULE]),
		);
	}
	return out;
}

/** One key per operation, in the order the nested form lists them: `GET /notes`, `Query.me`. */
function flatten(
	nested: Record<string, Record<string, Rule>>,
	join: (key: string, member: string) => string,
): Section {
	const out: Section = {};
	for (const [key, members] of Object.entries(nested)) {
		for (const member of Object.keys(members)) out[join(key, member)] = RULE;
	}
	return out;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const key = (name: string) => (IDENTIFIER.test(name) ? name : quote(name));
const RULE_TEXT = '{ authenticated: true }';

/** One section of the policy, a key per line, a nested key holding a rule per member. */
function sectionText(name: string, entries: Section): string[] {
	const lines = [`\t${name}: {`];
	for (const [entry, value] of Object.entries(entries)) {
		if (value === RULE) {
			lines.push(`\t\t${quote(entry)}: ${RULE_TEXT},`);
			continue;
		}
		lines.push(`\t\t${key(entry)}: {`);
		for (const member of Object.keys(value)) {
			lines.push(`\t\t\t${key(member)}: ${RULE_TEXT},`);
		}
		lines.push('\t\t},');
	}
	lines.push('\t},');
	return lines;
}

/**
 * A policy to start from, as TypeScript source for a `policy.ts`: every REST
 * operation and every GraphQL root field gets `authenticated: true` under
 * `unmatched: 'deny'`, written through `definePolicy`, so the generated types
 * check it. The document is built, run through `definePolicy` and compiled
 * before the text is returned, so a broken conversion fails here.
 *
 * `types` is the import specifier of the generated file, relative to the file
 * written (default `./generated/limix`). `flat` writes one key per operation
 * (`'GET /notes'`, `'Query.me'`) instead of a path or a type holding its
 * methods or fields; the policy is the same.
 */
export function starterPolicy(
	operations: readonly Operation[],
	options: { flat?: boolean; types?: string } = {},
): string {
	const nestedRest = restDocument(operations);
	const nestedGraphql = graphqlDocument(operations);
	const rest: Section = options.flat
		? flatten(nestedRest, (path, method) => `${method} ${path}`)
		: nestedRest;
	const graphql: Section = options.flat
		? flatten(nestedGraphql, (type, field) => `${type}.${field}`)
		: nestedGraphql;
	const document = (rest: Section, graphql: Section) => ({
		limix: 1 as const,
		global: { unmatched: 'deny' as const },
		...(Object.keys(rest).length ? { rest } : {}),
		...(Object.keys(graphql).length ? { graphql } : {}),
	});
	// The flat spelling must make the policy of the nested one.
	const policy = definePolicy(document(rest, graphql) as never);
	const expected = definePolicy(document(nestedRest, nestedGraphql) as never);
	if (JSON.stringify(policy) !== JSON.stringify(expected)) {
		throw new CodegenError('the flat policy differs from the nested one');
	}
	compilePolicy(policy);
	return [
		NOTE,
		`import ${quote(options.types ?? './generated/limix')};`,
		"import { definePolicy } from '@softistx/limix';",
		'',
		'export const rules = definePolicy({',
		'\tlimix: 1,',
		"\tglobal: { unmatched: 'deny' },",
		...(Object.keys(rest).length ? sectionText('rest', rest) : []),
		...(Object.keys(graphql).length ? sectionText('graphql', graphql) : []),
		'});',
		'',
	].join('\n');
}
