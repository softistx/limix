import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { PolicyStore, StoredPolicy } from '../remote/types';

/**
 * Keeps the last accepted policy in one JSON file. A write goes to a temp
 * file beside it, then renames over it, so a crash never leaves half a file.
 * A missing file is `null`; an unreadable one throws.
 */
export function filePolicyStore(path: string): PolicyStore {
	let sequence = 0;
	let renamed = 0;
	let renames: Promise<unknown> = Promise.resolve();
	return {
		async read() {
			let text: string;
			try {
				text = await Bun.file(path).text();
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
				throw error;
			}
			const value = JSON.parse(text) as Partial<StoredPolicy>;
			if (typeof value.jws !== 'string' || !value.jwks) {
				throw new Error(`${path} is not a stored policy`);
			}
			return value as StoredPolicy;
		},
		async write(value) {
			const mine = ++sequence;
			const temp = `${path}.${process.pid}.${mine}.${crypto.randomUUID()}.tmp`;
			try {
				await mkdir(dirname(temp), { recursive: true });
				// `mode` is applied when the file is created, never wider on disk.
				await writeFile(temp, JSON.stringify(value), {
					mode: 0o600,
					flag: 'wx',
				});
				// Renames run one at a time, so an abandoned older write never
				// renames over a newer one.
				const step = renames.then(async () => {
					if (mine < renamed) return rm(temp, { force: true });
					await rename(temp, path);
					// Only a rename that landed supersedes older writes.
					renamed = mine;
				});
				renames = step.catch(() => {});
				await step;
			} catch (error) {
				await rm(temp, { force: true }).catch(() => {});
				throw error;
			}
		},
	};
}
