import { stat } from 'node:fs/promises';
import { join } from 'node:path';

/** The effects the check needs, injected so specs run without a filesystem. */
export type EntryPointFs = {
	readManifest: (dir: string) => Promise<Record<string, unknown>>;
	exists: (path: string) => Promise<boolean>;
};

export const defaultEntryPointFs: EntryPointFs = {
	readManifest: (dir) => Bun.file(join(dir, 'package.json')).json(),
	exists: (path) =>
		stat(path).then(
			() => true,
			() => false,
		),
};

/** Every string target of an `exports` value, through nested conditions and subpaths. */
function exportTargets(value: unknown): string[] {
	if (typeof value === 'string') return [value];
	if (Array.isArray(value)) return value.flatMap(exportTargets);
	if (value !== null && typeof value === 'object') {
		return Object.values(value).flatMap(exportTargets);
	}
	return [];
}

/**
 * The files a manifest points to: `main`, `module`, `types`, `bin` (a string
 * or a map) and every string target in `exports`. A target with a `*` is a
 * pattern, not a file, and is left out. Relative, without a leading `./`.
 */
export function entryPointTargets(manifest: Record<string, unknown>): string[] {
	const raw: unknown[] = [
		manifest['main'],
		manifest['module'],
		manifest['types'],
		manifest['bin'],
		manifest['exports'],
	];
	const targets = raw
		.flatMap(exportTargets)
		.filter((target) => !target.includes('*'))
		.map((target) => target.replace(/^\.\//, ''));
	return [...new Set(targets)];
}

/** The entry points of the package in `dir` that do not exist on disk. */
export async function missingEntryPoints(
	dir: string,
	fs: EntryPointFs = defaultEntryPointFs,
): Promise<string[]> {
	const targets = entryPointTargets(await fs.readManifest(dir));
	const present = await Promise.all(
		targets.map((target) => fs.exists(join(dir, target))),
	);
	return targets.filter((_, i) => !present[i]);
}
