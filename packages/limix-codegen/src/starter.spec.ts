import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Rules } from '@softistx/limix';
import { loadRules } from '@softistx/limix/bun';
import type { Operation } from '@softistx/limix/coverage';
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
