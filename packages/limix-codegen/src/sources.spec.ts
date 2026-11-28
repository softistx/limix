import { describe, expect, it } from 'bun:test';
import type { RestOperation } from '@softistx/limix/coverage';
import {
	FIXTURE_OPENAPI,
	FIXTURE_OPENAPI_YAML,
	FIXTURE_SDL,
} from './codegen.fixtures';
import { CodegenError } from './errors';
import { bunOnly, readGraphql, readOpenapi } from './sources';

const files = (map: Record<string, string>) => ({
	readFile: async (path: string) => {
		const text = map[path];
		if (text === undefined) throw new Error(`no ${path}`);
		return text;
	},
});

describe('readOpenapi', () => {
	it('reads YAML and JSON by extension', async () => {
		const io = files({
			'a.yaml': FIXTURE_OPENAPI_YAML,
			'b.YML': FIXTURE_OPENAPI_YAML,
			'c.json': JSON.stringify(FIXTURE_OPENAPI),
		});
		const expected: RestOperation[] = [
			{ kind: 'rest', method: 'GET', path: '/notes' },
			{ kind: 'rest', method: 'GET', path: '/notes/:id' },
			{ kind: 'rest', method: 'DELETE', path: '/notes/:id' },
		];
		for (const path of ['a.yaml', 'b.YML', 'c.json']) {
			expect(await readOpenapi(path, io)).toEqual(expected);
		}
	});

	it('refuses another extension and unreadable text', async () => {
		const io = files({ 'a.txt': '', 'b.json': '{', 'c.yaml': 'a: [' });
		await expect(readOpenapi('a.txt', io)).rejects.toThrow(
			'a.txt: use .yaml, .yml or .json',
		);
		await expect(readOpenapi('b.json', io)).rejects.toThrow(
			'b.json: not readable: ',
		);
		await expect(readOpenapi('c.yaml', io)).rejects.toThrow(
			'c.yaml: not readable: ',
		);
	});

	it('names the file when the document is not OpenAPI', async () => {
		const io = files({ 'a.json': '{}' });
		await expect(readOpenapi('a.json', io)).rejects.toThrow(
			'a.json: not an OpenAPI document',
		);
	});
});

describe('readGraphql', () => {
	it('lists every field of every type, joined files included', async () => {
		const io = files({
			'a.graphql': 'type Query { me: Note }',
			'b.graphql': 'type Note { body: String }',
		});
		const operations = await readGraphql(['a.graphql', 'b.graphql'], io);
		expect(operations.map((o) => `${o.type}.${o.field}:${o.root}`)).toEqual([
			'Query.me:true',
			'Note.body:false',
		]);
	});

	it('reads the fixture schema', async () => {
		const operations = await readGraphql(
			['s.graphql'],
			files({ 's.graphql': FIXTURE_SDL }),
		);
		expect(operations).toHaveLength(3);
	});
});

describe('bunOnly', () => {
	it('passes on Bun', () => {
		expect(() => bunOnly('x')).not.toThrow();
		expect(CodegenError.name).toBe('CodegenError');
	});
});
