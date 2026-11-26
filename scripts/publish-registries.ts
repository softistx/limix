/**
 * The registry `scripts/publish.ts` publishes to: registry.npmjs.org, and
 * nothing else (owner, 2026-11-19; it replaces the 30 days of dual publishing
 * to npm.softistx.com and GitHub Packages).
 */

import { rmSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants, tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';

export type Registry = {
	/** What the logs call it. */
	label: string;
	/** With a trailing slash, as `bun publish --registry` and bunfig read it. */
	url: string;
	/** The environment variable that holds the publish token. */
	tokenEnv: string;
};

export const NPMJS: Registry = {
	label: 'npmjs',
	url: 'https://registry.npmjs.org/',
	tokenEnv: 'NPM_TOKEN',
};

function tokenOf(registry: Registry): string {
	const token = process.env[registry.tokenEnv];
	if (!token) {
		throw new Error(
			`${registry.tokenEnv} is unset: it authenticates the ${registry.label} reads and publishes`,
		);
	}
	return token;
}

/**
 * Already on this registry at this exact version? This reads the package's
 * document and looks the version up. Only a 404 means "never published"; a
 * 401 or 403 is a token problem, a registry that does not answer or answers
 * 5xx is down, and a 200 that is not a package document is unreadable: each
 * throws rather than letting `bun publish` try a version that may exist.
 */
export async function isPublished(
	name: string,
	version: string,
	fetcher: typeof fetch = fetch,
	registry: Registry = NPMJS,
): Promise<boolean> {
	const token = tokenOf(registry);
	const res = await fetcher(`${registry.url}${name.replace('/', '%2F')}`, {
		headers: { authorization: `Bearer ${token}` },
	}).catch((error: unknown) => {
		throw new Error(
			`${name}: ${registry.label} did not answer (${error instanceof Error ? error.message : String(error)})`,
		);
	});
	if (res.status === 404) return false;
	if (!res.ok) {
		throw new Error(
			`${name}: ${registry.label} answered ${res.status} (a 401 or 403 means the token lacks publish access to the @softistx scope on npmjs)`,
		);
	}
	const doc = (await res.json().catch(() => null)) as {
		versions?: unknown;
	} | null;
	const versions = doc?.versions;
	if (typeof versions !== 'object' || versions === null) {
		throw new Error(
			`${name}: ${registry.label} answered an unreadable document`,
		);
	}
	return (versions as Record<string, unknown>)[version] !== undefined;
}

const cleanups = new Set<() => void>();

function leave(signal: 'SIGINT' | 'SIGTERM'): void {
	for (const cleanup of cleanups) {
		try {
			cleanup();
		} catch {
			// Best effort: the others still run, and the process is leaving.
		}
	}
	process.exit(128 + constants.signals[signal]);
}
const onInt = () => leave('SIGINT');
const onTerm = () => leave('SIGTERM');

/**
 * Runs `cleanup` synchronously when SIGINT or SIGTERM arrives, then exits with
 * `128 + <signal>`; every registered cleanup runs before the exit. Returns the
 * function that unregisters it, which removes the listeners with the last one.
 */
export function cleanupOnSignal(cleanup: () => void): () => void {
	if (cleanups.size === 0) {
		process.on('SIGINT', onInt);
		process.on('SIGTERM', onTerm);
	}
	cleanups.add(cleanup);
	return () => {
		cleanups.delete(cleanup);
		if (cleanups.size === 0) {
			process.off('SIGINT', onInt);
			process.off('SIGTERM', onTerm);
		}
	};
}

/**
 * Runs `run` with the package's `publishConfig.registry` pointed at `url`, and
 * puts the manifest back byte for byte afterwards, even when `run` throws or
 * the process is interrupted (SIGINT, SIGTERM: written back synchronously).
 * Bun 1.4.4 ignores `--registry` when the manifest has a `publishConfig.registry`,
 * so the manifest is made to agree with the target.
 */
export async function withPublishRegistry<T>(
	dir: string,
	url: string,
	run: () => Promise<T>,
): Promise<T> {
	const path = join(dir, 'package.json');
	const original = await readFile(path, 'utf8');
	const manifest = JSON.parse(original) as {
		publishConfig?: Record<string, unknown>;
	};
	manifest.publishConfig = { ...manifest.publishConfig, registry: url };
	const restore = () => writeFileSync(path, original);
	const forget = cleanupOnSignal(restore);
	try {
		await writeFile(path, `${JSON.stringify(manifest, null, '\t')}\n`);
		return await run();
	} finally {
		forget();
		restore();
	}
}

/** What `bun publish` ran as: its exit code and both streams. */
export type Run = (
	command: string[],
	cwd: string,
) => Promise<{ exitCode: number; output: string }>;

const bunRun: Run = async (command, cwd) => {
	const result = await $`${command}`.cwd(cwd).quiet().nothrow();
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
};

/**
 * `bun publish` to one registry, with `publishConfig.registry` pointed at it
 * for the call. The scope's token comes from a throwaway bunfig read through
 * `--config`. The bunfig holds `$<ENV>`, never the token, and is removed
 * afterwards, also on an interrupt. Nothing is written to `~/.npmrc`.
 * `dryRun` adds `--dry-run`, which prints the `Registry:` it would use.
 * `run` is how the command is executed; a spec replaces it.
 */
export async function publishTo(
	dir: string,
	dryRun = false,
	run: Run = bunRun,
	registry: Registry = NPMJS,
): Promise<{ ok: boolean; output: string }> {
	tokenOf(registry);
	const tmp = await mkdtemp(join(tmpdir(), 'limix-publish-'));
	const forget = cleanupOnSignal(() =>
		rmSync(tmp, { recursive: true, force: true }),
	);
	try {
		const config = join(tmp, 'bunfig.toml');
		await writeFile(
			config,
			`[install.scopes]\n"@softistx" = { url = "${registry.url}", token = "$${registry.tokenEnv}" }\n`,
			{ mode: 0o600 },
		);
		const command = [
			'bun',
			'publish',
			`--config=${config}`,
			`--registry=${registry.url}`,
			...(dryRun ? ['--dry-run'] : []),
		];
		const result = await withPublishRegistry(dir, registry.url, () =>
			run(command, dir),
		);
		return { ok: result.exitCode === 0, output: result.output };
	} finally {
		forget();
		await rm(tmp, { recursive: true, force: true });
	}
}
