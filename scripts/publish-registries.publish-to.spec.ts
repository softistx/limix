import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { publishTo } from './publish-registries';
import {
	cleanTempDirs,
	npmjs,
	packageDir,
	TOKEN,
	withTokens,
} from './publish-registries.fixtures';

afterAll(cleanTempDirs);

describe('publishTo', () => {
	type Seen = {
		config: string;
		mode: number;
		path: string;
		command: string[];
	};

	/** A `bun publish` that records the throwaway bunfig it was pointed at. */
	function recorder(exitCode: number, crash = false) {
		const seen: Seen[] = [];
		const run = async (command: string[]) => {
			const path = (command.find((c) => c.startsWith('--config=')) ?? '').slice(
				'--config='.length,
			);
			seen.push({
				config: await readFile(path, 'utf8'),
				mode: statSync(path).mode & 0o777,
				path,
				command,
			});
			if (crash) throw new Error('spawn failed');
			return { exitCode, output: 'out' };
		};
		return { seen, run };
	}

	test('writes a 0600 bunfig that names the token variable, never the value', async () => {
		const dir = await packageDir();
		const { seen, run } = recorder(0);
		const result = await withTokens(TOKEN, () => publishTo(dir, false, run));
		expect(result).toEqual({ ok: true, output: 'out' });
		const [call] = seen;
		expect(call?.mode).toBe(0o600);
		expect(call?.config).toContain(`token = "$${npmjs.tokenEnv}"`);
		expect(call?.config).not.toContain('"a"');
		expect(call?.command).toContain(`--registry=${npmjs.url}`);
		expect(call?.command).not.toContain('--dry-run');
	});

	test('removes the bunfig after a success, a refusal and a crash', async () => {
		const dir = await packageDir();
		for (const [exitCode, crash] of [
			[0, false],
			[1, false],
			[0, true],
		] as const) {
			const { seen, run } = recorder(exitCode, crash);
			const outcome = withTokens(TOKEN, () => publishTo(dir, false, run));
			if (crash) await expect(outcome).rejects.toThrow('spawn failed');
			else expect((await outcome).ok).toBe(exitCode === 0);
			expect(existsSync(seen[0]?.path ?? '')).toBe(false);
		}
	});

	test('adds --dry-run on request', async () => {
		const dir = await packageDir();
		const { seen, run } = recorder(0);
		await withTokens(TOKEN, () => publishTo(dir, true, run));
		expect(seen[0]?.command).toContain('--dry-run');
	});
});
