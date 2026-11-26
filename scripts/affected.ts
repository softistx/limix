/**
 * The packages a pull request's CI has to build-check, type-check and test:
 * those holding a changed file, plus every workspace package that needs one of
 * them (transitively, over dependencies, devDependencies, peers and optional
 * peers) — a dependent is checked against the change.
 *
 *   bun scripts/affected.ts --since=origin/develop            # one dir per line
 *   bun scripts/affected.ts --since=origin/develop --run test # bun run --filter … test
 *   bun scripts/affected.ts --since=origin/develop --github-output
 *
 * Without `--since` every package is listed. A file outside `packages/` that
 * can change any result (the lockfile, root manifest, tsconfigs, Biome,
 * `build.ts`, `.github/`, `scripts/`) selects every package, and so does a
 * path under `packages/` that no package owns.
 *
 * `--run <script>` hands the selection to `bun run --filter`, which runs a
 * package after the siblings it depends on. `--github-output` appends
 * a `packages=` line to `$GITHUB_OUTPUT`: how many packages are selected, so
 * CI verifies the artifacts only when one is.
 */
import { appendFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { $ } from 'bun';
import { ROOT } from './artifacts/packages';

export interface Node {
	readonly name: string;
	readonly dir: string;
	readonly needs: readonly string[];
}

const FIELDS = [
	'dependencies',
	'devDependencies',
	'peerDependencies',
	'optionalDependencies',
] as const;

/**
 * Paths that belong to no package and change no build, test or type: docs,
 * changesets, licence, notes. Everything else outside `packages/` (the
 * lockfile, root manifest, tsconfigs, Biome, `build.ts`, `bunfig.toml`,
 * `.github/`, `scripts/`) can change any package's result.
 */
const INERT = [
	/^docs\//,
	/^\.changeset\//,
	/^\.claude\//,
	/^[^/]+\.md$/,
	/^LICENSE$/,
	/^\.gitignore$/,
	/^\.nxgt-issues\.json$/,
];

/**
 * The names to run for the files changed. `undefined` means everything: a file
 * outside the packages that can change any of them changed, or one under
 * `packages/` that no workspace member owns.
 */
export function affected(
	nodes: readonly Node[],
	changed: readonly string[],
): Set<string> | undefined {
	const roots = new Set<string>();
	for (const file of changed) {
		const owner = nodes.find((node) =>
			file.startsWith(`${relative(ROOT, node.dir)}/`),
		);
		if (owner !== undefined) roots.add(owner.name);
		else if (file.startsWith('packages/')) return undefined;
		else if (!INERT.some((pattern) => pattern.test(file))) return undefined;
	}
	let grew = true;
	while (grew) {
		grew = false;
		for (const node of nodes) {
			if (roots.has(node.name)) continue;
			if (node.needs.some((need) => roots.has(need))) {
				roots.add(node.name);
				grew = true;
			}
		}
	}
	return roots;
}

/** The files changed on this branch since it left `ref`. */
export async function changedSince(
	ref: string,
	cwd: string = ROOT,
): Promise<string[]> {
	const run = await $`git diff --name-only --no-renames ${ref}...HEAD`
		.cwd(cwd)
		.quiet();
	return run.stdout.toString().split('\n').filter(Boolean);
}

/** The workspace packages directly under `packages/`, in a stable order. */
export async function readNodes(): Promise<Node[]> {
	const nodes: Node[] = [];
	for (const rel of [
		...new Bun.Glob('packages/*/package.json').scanSync(ROOT),
	].sort()) {
		const manifest = await Bun.file(join(ROOT, rel)).json();
		const needs = new Set<string>();
		for (const field of FIELDS) {
			for (const name of Object.keys(manifest[field] ?? {})) needs.add(name);
		}
		needs.delete(manifest['name']);
		nodes.push({
			name: manifest['name'],
			dir: join(ROOT, rel.replace(/\/package\.json$/, '')),
			needs: [...needs],
		});
	}
	return nodes;
}

if (import.meta.main) {
	const args = process.argv.slice(2);
	const since = args.find((arg) => arg.startsWith('--since='));
	const run = args.indexOf('--run');
	const script = run === -1 ? undefined : args[run + 1];
	if (run !== -1 && script === undefined) {
		console.error(
			'Usage: bun scripts/affected.ts [--since=<ref>] --run <script>',
		);
		process.exit(1);
	}
	const nodes = await readNodes();
	let only: Set<string> | undefined;
	if (since !== undefined) {
		const changed = await changedSince(since.slice('--since='.length));
		only = affected(nodes, changed);
		console.error(
			only === undefined
				? `${changed.length} changed file(s), a root file among them: every package.`
				: `${changed.length} changed file(s): ${only.size} package(s) affected.`,
		);
	}
	const picked = nodes.filter(
		(node) => only === undefined || only.has(node.name),
	);
	const dirs = picked.map((node) => relative(ROOT, node.dir));
	if (args.includes('--github-output') && process.env['GITHUB_OUTPUT']) {
		appendFileSync(process.env['GITHUB_OUTPUT'], `packages=${picked.length}\n`);
	}
	if (script === undefined) {
		for (const dir of dirs) console.log(dir);
	} else if (dirs.length === 0) {
		console.log(`${script}: no package affected, nothing to run.`);
	} else {
		const filters = dirs.flatMap((dir) => ['--filter', `./${dir}`]);
		const result = await $`bun run ${filters} ${script}`.cwd(ROOT).nothrow();
		process.exit(result.exitCode);
	}
}
