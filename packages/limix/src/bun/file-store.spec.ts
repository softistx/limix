import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { StoredPolicy } from '../remote/types';
import { filePolicyStore } from './file-store';

// The machine's temp folder stalls for seconds under load (measured: 2.9 s for
// a handful of calls), so these file tests get a generous timeout.
const SLOW_FS = { timeout: 30_000 };

describe('filePolicyStore', () => {
	let root = '';
	beforeAll(async () => {
		root = await mkdtemp(join(tmpdir(), 'remote-policy-'));
	}, SLOW_FS.timeout);
	afterAll(async () => {
		await rm(root, { recursive: true, force: true });
	}, SLOW_FS.timeout);

	it(
		'reads null when absent, writes atomically and round-trips',
		async () => {
			const dir = join(root, 'round-trip');
			const path = join(dir, 'nested', 'policy.json');
			const store = filePolicyStore(path);
			expect(await store.read()).toBeNull();
			const value: StoredPolicy = {
				jws: 'a.b.c',
				jwks: { keys: [] },
				etag: '"1"',
			};
			await store.write(value);
			await store.write({ ...value, etag: '"2"' });
			expect((await store.read())?.etag).toBe('"2"');
			expect(await readdir(join(dir, 'nested'))).toEqual(['policy.json']);
			expect(JSON.parse(await readFile(path, 'utf8')).jws).toBe('a.b.c');
		},
		SLOW_FS.timeout,
	);

	it.skipIf(process.platform === 'win32')(
		'writes the policy readable by its owner only (0o600)',
		async () => {
			const path = join(root, 'mode', 'policy.json');
			await filePolicyStore(path).write({
				jws: 'a.b.c',
				jwks: { keys: [] },
				etag: '"1"',
			});
			expect((await stat(path)).mode & 0o777).toBe(0o600);
		},
		SLOW_FS.timeout,
	);

	it(
		'throws on a file that is not a stored policy',
		async () => {
			const dir = join(root, 'malformed');
			await mkdir(dir, { recursive: true });
			const path = join(dir, 'p.json');
			await Bun.write(path, '{"x":1}');
			await expect(filePolicyStore(path).read()).rejects.toThrow(
				'not a stored policy',
			);
		},
		SLOW_FS.timeout,
	);

	it(
		'leaves no temp file behind when a write fails',
		async () => {
			const dir = join(root, 'failed');
			const path = join(dir, 'policy.json');
			// A directory where the file should be: the rename over it fails.
			await mkdir(join(path, 'keep'), { recursive: true });
			const value: StoredPolicy = { jws: 'a.b.c', jwks: { keys: [] } };
			await expect(filePolicyStore(path).write(value)).rejects.toThrow();
			expect(await readdir(dir)).toEqual(['policy.json']);
		},
		SLOW_FS.timeout,
	);

	it(
		'never lets an older write rename over a newer one',
		async () => {
			const path = join(root, 'ordered', 'policy.json');
			const store = filePolicyStore(path);
			const at = (etag: string): StoredPolicy => ({
				jws: 'a.b.c',
				jwks: { keys: [] },
				etag,
			});
			for (let i = 0; i < 20; i++) {
				await Promise.all([
					store.write(at(`"a${i}"`)),
					store.write(at(`"b${i}"`)),
				]);
				expect((await store.read())?.etag).toBe(`"b${i}"`);
			}
			expect(await readdir(join(root, 'ordered'))).toEqual(['policy.json']);
		},
		SLOW_FS.timeout,
	);

	it(
		'never reports success for an older write when the newer rename failed',
		async () => {
			const dir = join(root, 'newer-fails');
			const path = join(dir, 'policy.json');
			// A directory where the file should be: every rename fails.
			await mkdir(join(path, 'keep'), { recursive: true });
			const store = filePolicyStore(path);
			const at = (etag: string): StoredPolicy => ({
				jws: 'a.b.c',
				jwks: { keys: [] },
				etag,
			});
			for (let i = 0; i < 20; i++) {
				const results = await Promise.allSettled([
					store.write(at(`"old${i}"`)),
					store.write(at(`"new${i}"`)),
				]);
				expect(results.map((r) => r.status)).toEqual(['rejected', 'rejected']);
			}
		},
		SLOW_FS.timeout,
	);
});
