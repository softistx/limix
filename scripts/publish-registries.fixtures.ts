import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NPMJS } from './publish-registries';

/** Shared by the `publish-registries.*.spec.ts` files. */

export const npmjs = NPMJS;

export async function withTokens<T>(
	tokens: Record<string, string | undefined>,
	run: () => Promise<T>,
): Promise<T> {
	const before = Object.fromEntries(
		Object.keys(tokens).map((k) => [k, process.env[k]]),
	);
	for (const [k, v] of Object.entries(tokens)) {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
	try {
		return await run();
	} finally {
		for (const [k, v] of Object.entries(before)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	}
}

export const TOKEN = { [npmjs.tokenEnv]: 'a' };

/** A fetch that answers per host: `status` or a packument holding `versions`. */
export function registries(
	byHost: Record<string, number | string[]>,
): typeof fetch {
	return (async (input: RequestInfo | URL) => {
		const host = new URL(String(input)).host;
		const answer = byHost[host];
		if (answer === undefined) return new Response('{}', { status: 500 });
		if (typeof answer === 'number')
			return new Response('{}', { status: answer });
		return new Response(
			JSON.stringify({
				versions: Object.fromEntries(answer.map((v) => [v, {}])),
			}),
		);
	}) as unknown as typeof fetch;
}

const dirs: string[] = [];

/** A temp dir that `cleanTempDirs` removes. */
export async function trackedDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'janus-manifest-'));
	dirs.push(dir);
	return dir;
}

/** Call from `afterAll`. */
export function cleanTempDirs(): Promise<unknown> {
	return Promise.all(
		dirs.map((dir) => rm(dir, { recursive: true, force: true })),
	);
}

/** A package directory whose manifest has a `publishConfig.registry` and an `access`. */
export async function manifestDir(): Promise<string> {
	const dir = await trackedDir();
	await writeFile(
		join(dir, 'package.json'),
		`${JSON.stringify({ name: '@softistx/x', publishConfig: { registry: npmjs.url, access: 'restricted' } }, null, '\t')}\n`,
	);
	return dir;
}

/** A package directory with a bare manifest. */
export async function packageDir(): Promise<string> {
	const dir = await trackedDir();
	await writeFile(
		join(dir, 'package.json'),
		JSON.stringify({ name: '@softistx/x' }),
	);
	return dir;
}
