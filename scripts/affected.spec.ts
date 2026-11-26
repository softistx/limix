import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { affected, changedSince, readNodes } from './affected';
import { ROOT } from './artifacts/packages';

const scratch: string[] = [];
afterAll(() => {
	for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

describe('affected', () => {
	const at = (dir: string) => `${ROOT}/${dir}`;
	const nodes = [
		{ name: '@softistx/janus', dir: at('packages/janus'), needs: [] },
		{
			name: '@softistx/janus-hono',
			dir: at('packages/janus-hono'),
			needs: ['@softistx/janus'],
		},
		{
			name: '@softistx/janus-kit',
			dir: at('packages/janus-kit'),
			needs: ['@softistx/janus', '@softistx/janus-hono'],
		},
		{ name: '@softistx/janus-mail', dir: at('packages/janus-mail'), needs: [] },
	];
	const names = (changed: string[]) => [...(affected(nodes, changed) ?? [])];

	test('a package and everything that needs it, transitively', () => {
		expect(names(['packages/janus/src/a.ts']).sort()).toEqual([
			'@softistx/janus',
			'@softistx/janus-hono',
			'@softistx/janus-kit',
		]);
		expect(names(['packages/janus-hono/README.md']).sort()).toEqual([
			'@softistx/janus-hono',
			'@softistx/janus-kit',
		]);
	});

	test('a leaf runs alone', () => {
		expect(names(['packages/janus-mail/src/a.ts'])).toEqual([
			'@softistx/janus-mail',
		]);
	});

	test('docs, changesets and notes run nothing', () => {
		expect(
			names(['docs/guide.md', '.changeset/x.md', 'AGENTS.md', 'LICENSE']),
		).toEqual([]);
	});

	test('a root file runs everything', () => {
		for (const file of [
			'bun.lock',
			'package.json',
			'tsconfig.base.json',
			'biome.json',
			'build.ts',
			'.github/workflows/ci.yml',
			'scripts/affected.ts',
		]) {
			expect(affected(nodes, [file])).toBeUndefined();
		}
		expect(
			affected(nodes, ['packages/janus-mail/a.ts', 'bun.lock']),
		).toBeUndefined();
	});

	test('a path under packages/ that no package owns runs everything', () => {
		expect(affected(nodes, ['packages/gone/a.ts'])).toBeUndefined();
	});
});

describe('readNodes', () => {
	test('reads the workspace', async () => {
		const all = await readNodes();
		for (const node of all) expect(node.name).toStartWith('@softistx/');
		expect(all.map((node) => node.name)).toContain('@softistx/limix');
	});
});

describe('changedSince', () => {
	// Ten git processes in a fresh repository: past bun's 5 s default on a loaded
	// machine, so it gets its own budget.
	test('a rename across packages lists both paths', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'affected-'));
		scratch.push(dir);
		const git = (...args: string[]) => $`git ${args}`.cwd(dir).quiet();
		await git('init', '-q', '-b', 'develop');
		await git('config', 'user.email', 'a@b.c');
		await git('config', 'user.name', 'x');
		await git('config', 'commit.gpgsign', 'false');
		await $`mkdir -p packages/a packages/b`.cwd(dir);
		writeFileSync(
			join(dir, 'packages/a/f.ts'),
			'export const f = 1;\n'.repeat(20),
		);
		await git('add', '-A');
		await git('commit', '-qm', 'base');
		await git('checkout', '-qb', 'work');
		await git('mv', 'packages/a/f.ts', 'packages/b/f.ts');
		await git('commit', '-qam', 'move');
		expect((await changedSince('develop', dir)).sort()).toEqual([
			'packages/a/f.ts',
			'packages/b/f.ts',
		]);
	}, 30_000);
});

describe('the command line', () => {
	const run = async (...args: string[]) => {
		const outDir = mkdtempSync(join(tmpdir(), 'affected-out-'));
		scratch.push(outDir);
		const out = join(outDir, 'output');
		writeFileSync(out, '');
		const result = await $`bun ${join(ROOT, 'scripts/affected.ts')} ${args}`
			.cwd(ROOT)
			.env({ ...process.env, ['GITHUB_OUTPUT']: out })
			.nothrow()
			.quiet();
		return {
			code: result.exitCode,
			stdout: result.stdout.toString(),
			out: readFileSync(out, 'utf8'),
		};
	};

	test('every package: the count is written', async () => {
		const { code, out } = await run('--github-output');
		expect(code).toBe(0);
		expect(out).toMatch(/^packages=[1-9]\d*\n$/);
	});

	test('an empty selection exits 0 and writes 0', async () => {
		const { code, out, stdout } = await run(
			'--since=HEAD',
			'--github-output',
			'--run',
			'test',
		);
		expect(code).toBe(0);
		expect(out).toBe('packages=0\n');
		expect(stdout).toContain('nothing to run');
	});
});
