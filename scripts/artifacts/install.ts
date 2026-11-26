import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { type Pkg, ROOT } from './packages';
import { onRegistry } from './registry';
import { readTarball, type Tarball } from './tarball';

/** The repository's bunfig.toml: its @softistx scope reads with the read token. */
const REPO_BUNFIG = join(ROOT, 'bunfig.toml');

export type Packed = {
	tarballs: Tarball[];
	/** Each package's name to `file:<its tarball>`. */
	overrides: Record<string, string>;
};

/** Packs every package into `workdir`, the way `npm publish` would. */
export async function pack(
	workdir: string,
	packages: readonly Pkg[],
): Promise<Packed> {
	console.log(`Packing ${packages.length} packages…`);
	const files: string[] = [];
	const overrides: Record<string, string> = {};
	for (const pkg of packages) {
		await $`bun pm pack --destination ${workdir}`.cwd(pkg.dir).quiet();
		const file = [...new Bun.Glob('*.tgz').scanSync(workdir)]
			.map((f) => join(workdir, f))
			.find((f) => !files.includes(f));
		if (!file) throw new Error(`${pkg.name}: bun pm pack produced no tarball`);
		files.push(file);
		overrides[pkg.name] = `file:${file}`;
	}
	return { tarballs: await Promise.all(files.map(readTarball)), overrides };
}

/**
 * An optional peer is installed only by whoever asks for it, so ask for each
 * one: the subpath that needs it then loads because it is installed on
 * purpose, not because another package's peer happened to hoist it. One on no
 * registry is left out, as the manifest check allows.
 */
async function optionalPeersOf({
	tarballs,
	overrides,
}: Packed): Promise<Record<string, string>> {
	const peers: Record<string, string> = {};
	for (const { manifest } of tarballs) {
		const meta =
			(manifest['peerDependenciesMeta'] as Record<
				string,
				{ optional?: boolean }
			>) ?? {};
		for (const [peer, range] of Object.entries<string>(
			(manifest['peerDependencies'] as Record<string, string>) ?? {},
		)) {
			if (!meta[peer]?.optional || peer in overrides || peer in peers) {
				continue;
			}
			if (await onRegistry(peer)) peers[peer] = range;
		}
	}
	return peers;
}

/**
 * The `typescript` the probe installs: the workspace's own, its root
 * `devDependencies` range. Left to Bun, the probe would take the newest
 * version the packages' `^6.0.3 || ^7.0.0` peer allows, so the fixture emit
 * (`emit.ts`) would run whatever the peer allows rather than the workspace's
 * own. With the root's range it runs 7 (`~7.0.2`) in every job. Empty
 * when the root names no `typescript`.
 */
export function workspaceTypeScript(
	root: Record<string, unknown>,
): Record<string, string> {
	const range = (
		root['devDependencies'] as Record<string, string> | undefined
	)?.['typescript'];
	return range === undefined ? {} : { typescript: range };
}

/**
 * Installs the tarballs in `workdir` as a consumer would; false if the install
 * fails. `overrides` makes the packages resolve to each other's tarballs, not
 * to the registry's published versions.
 */
export async function installAsConsumer(
	workdir: string,
	packed: Packed,
): Promise<boolean> {
	const { overrides } = packed;
	const typescript = workspaceTypeScript(
		await Bun.file(join(ROOT, 'package.json')).json(),
	);
	const probe = {
		name: 'nxgt-janus-artifact-probe',
		private: true,
		version: '0.0.0',
		type: 'module',
		dependencies: {
			...(await optionalPeersOf(packed)),
			...typescript,
			...overrides,
		},
		overrides,
		resolutions: overrides,
	};
	await Bun.write(
		join(workdir, 'package.json'),
		`${JSON.stringify(probe, null, 2)}\n`,
	);
	// The probe sits outside the repository, so it does not see its bunfig.toml:
	// without it the @softistx scope is read anonymously and 404s.
	// A laptop hides this through ~/.bunfig.toml; CI does not.
	await Bun.write(join(workdir, 'bunfig.toml'), Bun.file(REPO_BUNFIG));

	console.log('Installing them as a consumer would…');
	let install = await $`bun install`.cwd(workdir).quiet().nothrow();
	const names = Object.keys(overrides);
	if (install.exitCode === 0) {
		const missing = await missingFromInstall(workdir, names);
		if (missing.length > 0) {
			console.warn(poisonedCacheWarning(missing));
			install = await installWithOwnCache(workdir);
		}
	}
	if (install.exitCode === 0) {
		const missing = await missingFromInstall(workdir, names);
		if (missing.length > 0) {
			console.error(
				`\nThe install exited 0 but left these without a readable package.json:\n` +
					missing.map((name) => `  ${name}`).join('\n'),
			);
			return false;
		}
		const installed = Bun.file(
			join(workdir, 'node_modules/typescript/package.json'),
		);
		if (await installed.exists()) {
			console.log(`  typescript ${(await installed.json()).version}`);
		}
		return true;
	}
	console.error(`\n${install.stderr.toString().trim()}`);
	console.error(
		'\nThe install failed. A required peer on a package that is on no\n' +
			'registry is the usual cause — an optional one never fails an install.',
	);
	return false;
}

/**
 * The packages of `names` the install in `workdir` left without a
 * `package.json` that names them (none, or an empty one), which the probe
 * then reports as `Cannot find package`.
 */
export async function missingFromInstall(
	workdir: string,
	names: readonly string[],
): Promise<string[]> {
	const missing: string[] = [];
	for (const name of names) {
		const manifest = Bun.file(
			join(workdir, 'node_modules', name, 'package.json'),
		);
		const read = (await manifest.exists())
			? await manifest.json().catch(() => undefined)
			: undefined;
		if (read?.name !== name) missing.push(name);
	}
	return missing;
}

/**
 * Bun keys a local tarball in its global cache by the tarball's hash, and
 * `bun pm pack` is reproducible, so an unchanged package hits the entry the
 * last run wrote. An entry cut short stays broken for as long as the package
 * does not change: the self-hosted runner rebooted mid-install on 2026-11-06
 * and left empty `package.json` files there, the install still exited 0, and
 * every run after it failed to load the packages that had not changed.
 */
function poisonedCacheWarning(missing: readonly string[]): string {
	return (
		`\nThe install exited 0 but left ${missing.join(', ')} without a readable\n` +
		"package.json: Bun's global cache holds a broken entry for its tarball.\n" +
		'Installing again with a cache of its own. Clear the global one\n' +
		'(`bun pm cache rm`, as the user that runs this) to stop paying for it.'
	);
}

/** Installs again from scratch, with a cache nothing else has written to. */
async function installWithOwnCache(workdir: string) {
	await rm(join(workdir, 'node_modules'), { recursive: true, force: true });
	const env: Record<string, string | undefined> = { ...process.env };
	env['BUN_INSTALL_CACHE_DIR'] = join(workdir, '.cache');
	return $`bun install`.cwd(workdir).env(env).quiet().nothrow();
}
