import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	type EntryPointFs,
	entryPointTargets,
	missingEntryPoints,
} from './publish-entry-points';

describe('entryPointTargets', () => {
	test('collects main, module, types, bin and nested export conditions', () => {
		expect(
			entryPointTargets({
				main: './dist/index.js',
				module: './dist/index.mjs',
				types: './dist/index.d.ts',
				bin: { janus: './dist/cli.js' },
				exports: {
					'.': {
						types: './dist/index.d.ts',
						import: { default: './dist/index.mjs' },
					},
					'./testing': './dist/testing.js',
					'./package.json': './package.json',
				},
			}),
		).toEqual([
			'dist/index.js',
			'dist/index.mjs',
			'dist/index.d.ts',
			'dist/cli.js',
			'dist/testing.js',
			'package.json',
		]);
	});

	test('accepts a bin string and an exports array, ignores patterns', () => {
		expect(
			entryPointTargets({
				bin: './dist/cli.js',
				exports: { './x': ['./dist/x.js'], './*': './dist/*.js' },
			}),
		).toEqual(['dist/cli.js', 'dist/x.js']);
	});

	test('skips a null export and keeps a bin without a leading ./', () => {
		expect(
			entryPointTargets({
				bin: 'dist/cli.js',
				exports: { './internal': null, '.': './dist/index.js' },
			}),
		).toEqual(['dist/cli.js', 'dist/index.js']);
	});

	test('a manifest with no entry points has no targets', () => {
		expect(entryPointTargets({ name: 'x' })).toEqual([]);
	});
});

describe('missingEntryPoints', () => {
	const fsWith = (files: string[]): EntryPointFs => ({
		readManifest: async () => ({
			main: './dist/index.js',
			exports: { '.': { types: './dist/index.d.ts' } },
		}),
		exists: async (path) => files.includes(path),
	});

	test('an unbuilt package lists every missing target', async () => {
		expect(await missingEntryPoints('/p', fsWith([]))).toEqual([
			'dist/index.js',
			'dist/index.d.ts',
		]);
	});

	test('a built package has none missing', async () => {
		expect(
			await missingEntryPoints(
				'/p',
				fsWith(['/p/dist/index.js', '/p/dist/index.d.ts']),
			),
		).toEqual([]);
	});

	test('names only the targets that are absent', async () => {
		expect(
			await missingEntryPoints('/p', fsWith(['/p/dist/index.js'])),
		).toEqual(['dist/index.d.ts']);
	});
});

describe('missingEntryPoints on the real filesystem', () => {
	const dirs: string[] = [];
	afterAll(() =>
		Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true }))),
	);

	test('reports the file that is not on disk', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'janus-entry-points-'));
		dirs.push(dir);
		await Bun.write(
			join(dir, 'package.json'),
			JSON.stringify({
				main: './dist/index.js',
				types: './dist/index.d.ts',
			}),
		);
		await Bun.write(join(dir, 'dist', 'index.js'), '');

		expect(await missingEntryPoints(dir)).toEqual(['dist/index.d.ts']);
	});
});
