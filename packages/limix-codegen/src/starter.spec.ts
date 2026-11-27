import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Rules } from '@softistx/limix';
import { compilePolicy, evaluateRest } from '@softistx/limix';
import { loadRules } from '@softistx/limix/bun';
import type { Operation } from '@softistx/limix/coverage';
import { CodegenError } from './errors';
import { starterRules } from './starter';

const operations: Operation[] = [
	{ kind: 'rest', method: 'POST', path: '/notes' },
	{ kind: 'rest', method: 'GET', path: '/notes' },
	{ kind: 'rest', method: 'GET', path: '/notes' },
	{ kind: 'rest', method: 'DELETE', path: '/notes/:id' },
	{ kind: 'graphql', type: 'Query', field: 'me', root: true },
	{ kind: 'graphql', type: 'Query', field: 'all', root: true },
	{ kind: 'graphql', type: 'Mutation', field: 'createNote', root: true },
	{ kind: 'graphql', type: 'Note', field: 'body', root: false },
];

const doc = (rest?: Rules['rest'], graphql?: Rules['graphql']) => ({
	limix: 1 as const,
	global: { unmatched: 'deny' as const },
	...(rest ? { rest } : {}),
	...(graphql ? { graphql } : {}),
});
const rule = { authenticated: true };

async function loaded(text: string, name: string) {
	const dir = await mkdtemp(join(tmpdir(), 'limix-codegen-'));
	try {
		const path = join(dir, name);
		await Bun.write(path, text);
		return await loadRules(path);
	} finally {
		await rm(dir, { recursive: true });
	}
}

describe('starterRules', () => {
	const expected = doc(
		{
			'/notes': { GET: rule, POST: rule },
			'/notes/:id': { DELETE: rule },
		},
		{
			Query: { all: rule, me: rule },
			Mutation: { createNote: rule },
		},
	);

	it('writes a YAML file loadRules reads back', async () => {
		const text = starterRules(operations, 'yaml');
		expect(text.startsWith('# yaml-language-server: $schema=')).toBe(true);
		expect(text.endsWith('\n')).toBe(true);
		expect(await loaded(text, 'rules.yaml')).toEqual(expected);
	});

	it('writes a JSON file loadRules reads back', async () => {
		const text = starterRules(operations, 'json');
		expect(await loaded(text, 'rules.json')).toEqual(expected);
	});

	it('leaves non-root GraphQL fields out', () => {
		expect(starterRules(operations, 'yaml')).not.toContain('  Note:');
	});

	it('handles REST-only and GraphQL-only input', async () => {
		const restOnly = operations.filter((o) => o.kind === 'rest');
		const gqlOnly = operations.filter((o) => o.kind === 'graphql');
		expect(
			(await loaded(starterRules(restOnly, 'yaml'), 'a.yaml')).graphql,
		).toBeUndefined();
		expect(
			(await loaded(starterRules(gqlOnly, 'yaml'), 'b.yaml')).rest,
		).toBeUndefined();
	});

	it('keeps a path with a quote and a backslash', async () => {
		const path = '/a\\"b';
		const rules = await loaded(
			starterRules([{ kind: 'rest', method: 'GET', path }], 'yaml'),
			'c.yaml',
		);
		expect(Object.keys(rules.rest ?? {})).toEqual([path]);
	});
});

describe('starterRules, keys and order', () => {
	it('quotes every key a YAML reader would take for a value', async () => {
		const gql = (type: string, field: string): Operation => ({
			kind: 'graphql',
			type,
			field,
			root: true,
		});
		const rules = await loaded(
			starterRules(
				[
					gql('True', 'NULL'),
					gql('True', 'null'),
					gql('True', 'Null'),
					gql('True', 'yes'),
				],
				'yaml',
			),
			'k.yaml',
		);
		expect(Object.keys(rules.graphql ?? {})).toEqual(['True']);
		expect(Object.keys(rules.graphql?.['True'] ?? {})).toEqual([
			'NULL',
			'Null',
			'null',
			'yes',
		]);
	});

	it('writes a static segment before a capture and a capture before a wildcard', () => {
		const paths = ['/f/*rest', '/notes/:id', '/notes/new', '/notes'].map(
			(path): Operation => ({ kind: 'rest', method: 'GET', path }),
		);
		const text = starterRules(paths, 'yaml');
		const order = [...text.matchAll(/^ {2}"([^"]+)":$/gm)].map((m) => m[1]);
		expect(order).toEqual(['/f/*rest', '/notes', '/notes/new', '/notes/:id']);
	});

	it('lets a public rule on /notes/new win over /notes/:id', async () => {
		const text = starterRules(
			[
				{ kind: 'rest', method: 'GET', path: '/notes/:id' },
				{ kind: 'rest', method: 'GET', path: '/notes/new' },
			],
			'yaml',
		).replace(
			'"/notes/new":\n    GET:\n      authenticated: true',
			'"/notes/new":\n    GET:\n      public: true',
		);
		const policy = compilePolicy(await loaded(text, 'p.yaml'));
		const decision = await evaluateRest(policy, {
			method: 'GET',
			path: '/notes/new',
			claims: { authenticated: false },
		});
		expect(decision.allow).toBe(true);
	});
});

describe('starterRules, read-back', () => {
	it('refuses a path the YAML text cannot carry, as a CodegenError', () => {
		expect(() =>
			starterRules([{ kind: 'rest', method: 'GET', path: '/a\ud800' }], 'yaml'),
		).toThrow(CodegenError);
	});
});
