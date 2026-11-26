import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RulesError } from './error';
import { EXAMPLE_POLICY, EXAMPLE_YAML } from './example.fixtures';
import { loadRules } from './load';

describe('loadRules', () => {
	let dir: string;
	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), 'limix-rules-'));
	});
	afterEach(() => rm(dir, { recursive: true, force: true }));

	async function write(name: string, text: string): Promise<string> {
		const path = join(dir, name);
		await writeFile(path, text);
		return path;
	}

	it('reads YAML (.yaml and .yml) and JSON by extension', async () => {
		const json = JSON.stringify({ limix: 1, global: { unmatched: 'allow' } });
		expect(await loadRules(await write('a.yaml', EXAMPLE_YAML))).toEqual(
			EXAMPLE_POLICY,
		);
		expect(await loadRules(await write('a.yml', EXAMPLE_YAML))).toEqual(
			EXAMPLE_POLICY,
		);
		expect(await loadRules(await write('a.json', json))).toEqual({
			limix: 1,
			global: { unmatched: 'allow' },
		});
	});

	it('names the file in a validation error', async () => {
		const path = await write('bad.yaml', 'limix: 1\nglobal: {}\n');
		expect(loadRules(path)).rejects.toThrow(
			`Invalid rules in ${path}: 1 issue`,
		);
	});

	it('refuses another extension and an unreadable document', async () => {
		const txt = await write('a.txt', 'limix: 1');
		expect(loadRules(txt)).rejects.toThrow(/unsupported extension `\.txt`/);
		const broken = await write('b.json', '{ nope');
		const error = await loadRules(broken).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(RulesError);
		expect((error as RulesError).issues[0]?.message).toMatch(/^not readable: /);
	});
});
