import { compilePolicy, parseRules } from '@softistx/limix';
import type { Operation } from '@softistx/limix/coverage';
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
	for (const path of [...methods.keys()].sort(compareText)) {
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
		keyOf: (key: string) => string,
	) => {
		lines.push(`${name}:`);
		for (const [key, members] of Object.entries(entries)) {
			lines.push(`  ${keyOf(key)}:`);
			for (const member of Object.keys(members)) {
				lines.push(`    ${member}:`, '      authenticated: true');
			}
		}
	};
	if (document.rest)
		section('rest', document.rest, (key) => JSON.stringify(key));
	if (document.graphql) section('graphql', document.graphql, (key) => key);
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
	compilePolicy(parseRules(document, 'starter'));
	return format === 'json'
		? `${JSON.stringify(document, null, '\t')}\n`
		: yamlOf(document);
}
