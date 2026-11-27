import { compilePolicy, parseRules } from '@softistx/limix';
import type { Operation } from '@softistx/limix/coverage';
import { CodegenError } from './errors';
import { compareText, METHODS } from './order';

const YAML_HINT =
	'# yaml-language-server: $schema=node_modules/@softistx/limix/schema/rules.schema.json';
const NOTE =
	'# Written once by limix-codegen init: every operation needs a signed-in caller until you write its rule.';

type Rule = { authenticated: true };
type Document = {
	limix: 1;
	global: { unmatched: 'deny' };
	rest?: Record<string, Record<string, Rule>>;
	graphql?: Record<string, Record<string, Rule>>;
};

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

function yamlOf(document: Document): string {
	const lines = [YAML_HINT, NOTE, 'limix: 1', 'global:', '  unmatched: deny'];
	const section = (
		name: string,
		entries: Record<string, Record<string, Rule>>,
		memberOf: (key: string) => string,
	) => {
		lines.push(`${name}:`);
		for (const [key, members] of Object.entries(entries)) {
			lines.push(`  ${JSON.stringify(key)}:`);
			for (const member of Object.keys(members)) {
				lines.push(`    ${memberOf(member)}:`, '      authenticated: true');
			}
		}
	};
	if (document.rest) section('rest', document.rest, (method) => method);
	if (document.graphql)
		section('graphql', document.graphql, (field) => JSON.stringify(field));
	return `${lines.join('\n')}\n`;
}

/**
 * A rules file to start from: every REST operation and every GraphQL root
 * field gets `authenticated: true` under `unmatched: deny`. It is validated
 * and compiled before it is returned, so a broken conversion fails here.
 */
export function starterRules(
	operations: readonly Operation[],
	format: 'yaml' | 'json',
): string {
	const rest = restDocument(operations);
	const graphql = graphqlDocument(operations);
	const document: Document = {
		limix: 1,
		global: { unmatched: 'deny' },
		...(Object.keys(rest).length ? { rest } : {}),
		...(Object.keys(graphql).length ? { graphql } : {}),
	};
	const expected = parseRules(document, 'starter');
	compilePolicy(expected);
	if (format === 'json') return `${JSON.stringify(document, null, '\t')}\n`;
	const text = yamlOf(document);
	// The read-back needs Bun's YAML reader: on Node the check is skipped.
	if (typeof globalThis.Bun === 'undefined') return text;
	try {
		if (!Bun.deepEquals(parseRules(Bun.YAML.parse(text)), expected)) {
			throw new CodegenError(
				'the text differs from the rules it was written from',
			);
		}
	} catch (error) {
		if (error instanceof CodegenError && error.message.startsWith('starter')) {
			throw error;
		}
		const reason = error instanceof Error ? error.message : String(error);
		throw new CodegenError(`starter rules did not read back: ${reason}`);
	}
	return text;
}
