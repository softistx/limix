import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { missingFromInstall, workspaceTypeScript } from './install';

describe('workspaceTypeScript', () => {
	test("pins the probe's typescript to the root devDependencies range", () => {
		expect(
			workspaceTypeScript({ devDependencies: { typescript: '~6.0.3' } }),
		).toEqual({ typescript: '~6.0.3' });
	});

	test('follows the range newest-peers.ts writes', () => {
		expect(
			workspaceTypeScript({
				devDependencies: { typescript: '^7.0.0' },
				overrides: { typescript: '^7.0.0' },
			}),
		).toEqual({ typescript: '^7.0.0' });
	});

	test('pins nothing when the root names no typescript', () => {
		expect(workspaceTypeScript({})).toEqual({});
		expect(workspaceTypeScript({ devDependencies: {} })).toEqual({});
	});
});

describe('missingFromInstall', () => {
	test('names each package the install left without a package.json naming it', async () => {
		const workdir = await mkdtemp(join(tmpdir(), 'missing-from-install-'));
		try {
			await Bun.write(
				join(workdir, 'node_modules/@softistx/janus/package.json'),
				'{"name":"@softistx/janus"}',
			);
			await Bun.write(
				join(workdir, 'node_modules/@softistx/janus-mail/package.json'),
				'{"name":"@softistx/janus-mail"}',
			);
			// What a cache entry cut short links: the file is there, empty.
			await Bun.write(
				join(workdir, 'node_modules/@softistx/janus-redis/package.json'),
				'',
			);
			await mkdir(join(workdir, 'node_modules/@softistx/janus-oauth'), {
				recursive: true,
			});
			expect(
				await missingFromInstall(workdir, [
					'@softistx/janus',
					'@softistx/janus-mail',
					'@softistx/janus-oauth',
					'@softistx/janus-redis',
					'@softistx/janus-social',
				]),
			).toEqual([
				'@softistx/janus-oauth',
				'@softistx/janus-redis',
				'@softistx/janus-social',
			]);
		} finally {
			await rm(workdir, { recursive: true, force: true });
		}
	});
});
