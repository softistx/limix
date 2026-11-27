#!/usr/bin/env bun
/**
 * Publishes every package whose current version is not on the registry yet,
 * in dependency order, with `bun publish`.
 *
 * This exists instead of `changeset publish` because Changesets shells out to
 * `npm publish`, and Bun is the package manager for this repository: the
 * lockfile is `bun.lock`, `bun pm pack` is what rewrites `workspace:*` into a
 * real version, and `verify:artifacts` reproduces a Bun install specifically.
 * Publishing with a different package manager than the one everything else is
 * verified against is how you ship an artifact nobody tested.
 *
 * `changeset version` still does the versioning and the changelogs — it is
 * pure bookkeeping and touches no registry. Only the publish step is ours.
 *
 * Output format: every published package prints `New tag: <name>@<version>`
 * (what `changesets/action@v1` parsed) and, when `$CHANGESETS_OUTPUT` is set,
 * appends one NDJSON `git-tag` event for `@v2`. Do not drop either without
 * checking the action version in `.github/workflows/release.yml` (the Version
 * PR) and `publish.yml`. The tag already exists when `publish.yml` runs (the
 * release owner pushed it); the local re-tag only keeps `announceTag`'s
 * contract, that an announced tag exists.
 *
 * Every version goes to registry.npmjs.org and nowhere else (owner,
 * 2026-11-19), from CI only: `.github/workflows/publish.yml` runs it on a tag
 * with `$NPM_TOKEN` (the org secret). A version already on npmjs is skipped, so
 * a re-run resumes. Nothing is written to `~/.npmrc`.
 *
 * This script never builds. Run `bun run build` first: a package whose
 * `package.json` points to a file that is not on disk (`main`, `module`,
 * `types`, `bin`, an `exports` target) fails instead of publishing, and its
 * dependents are skipped (`publish-entry-points.ts`).
 */

import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { announceTag, publishInOrder, publishPackage } from './publish-package';

/** One NDJSON event `changesets/action@v2` reads from `$CHANGESETS_OUTPUT`. */
export function changesetsGitTagEvent(
	packageName: string,
	tag: string,
): string {
	return `${JSON.stringify({ type: 'git-tag', tag, packageName })}\n`;
}

export async function appendChangesetsOutput(
	outputPath: string,
	packageName: string,
	tag: string,
): Promise<void> {
	await appendFile(outputPath, changesetsGitTagEvent(packageName, tag));
}

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');

export type Pkg = {
	name: string;
	version: string;
	dir: string;
	deps: Set<string>;
};

export async function readPackages(root: string = ROOT): Promise<Pkg[]> {
	const pkgs: Pkg[] = [];
	for (const rel of [
		...new Bun.Glob('packages/*/package.json').scanSync(root),
	].sort()) {
		const m = await Bun.file(join(root, rel)).json();
		if (m.private) continue;
		if (m.version === '0.0.0') {
			console.log(
				`${m.name}: version 0.0.0 waits for its Version PR, not published`,
			);
			continue;
		}
		const deps = new Set<string>();
		for (const field of ['dependencies', 'peerDependencies']) {
			for (const dep of Object.keys(m[field] ?? {})) {
				if (dep.startsWith('@softistx/')) deps.add(dep);
			}
		}
		pkgs.push({
			name: m.name,
			version: m.version,
			dir: join(root, rel.replace(/\/package\.json$/, '')),
			deps,
		});
	}
	return pkgs;
}

/** Dependencies first, so a consumer is never on the registry before its dependency. */
export function inDependencyOrder(pkgs: Pkg[]): Pkg[] {
	const byName = new Map(pkgs.map((p) => [p.name, p]));
	const done = new Set<string>();
	const order: Pkg[] = [];
	while (order.length < pkgs.length) {
		const ready = pkgs.filter(
			(p) =>
				!done.has(p.name) &&
				[...p.deps].every((d) => !byName.has(d) || done.has(d)),
		);
		if (ready.length === 0) {
			const stuck = pkgs.filter((p) => !done.has(p.name)).map((p) => p.name);
			throw new Error(`dependency cycle between: ${stuck.join(', ')}`);
		}
		for (const p of ready) {
			order.push(p);
			done.add(p.name);
		}
	}
	return order;
}

async function main(): Promise<void> {
	const packages = inDependencyOrder(await readPackages());
	const changesetsOutput = process.env['CHANGESETS_OUTPUT'];

	const { published, failed, skipped } = await publishInOrder(
		packages,
		publishPackage,
		(tag, packageName) =>
			announceTag(
				tag,
				packageName,
				changesetsOutput,
				ROOT,
				appendChangesetsOutput,
			),
	);

	console.log(
		`\n${published} published, ${failed} failed, ${skipped} skipped, ` +
			`${packages.length - published - failed - skipped} already up to date.`,
	);

	if (failed > 0 || skipped > 0) {
		console.error(
			'\nA publish failed. A 401 or 403 means $NPM_TOKEN lacks\n' +
				'publish access to the @softistx scope on npmjs. A skipped package\n' +
				'depends on one that failed.\n' +
				'See AGENTS.md.',
		);
		process.exit(1);
	}
}

if (import.meta.main) {
	await main();
}
