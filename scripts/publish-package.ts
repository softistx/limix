import { $ } from 'bun';
import type { Pkg } from './publish';
import { missingEntryPoints } from './publish-entry-points';
import { isPublished, NPMJS, publishTo } from './publish-registries';
import { publishWithRetry } from './publish-retry';

/** What one package's publish step came to. */
export type PackageOutcome = {
	/** npmjs refused, or could not be asked. */
	failed: boolean;
	/** npmjs newly took the version. */
	published: boolean;
	/** The tag to create and announce: set only when npmjs newly took the version. */
	tag: string | undefined;
};

export type PublishDeps = {
	isPublished: typeof isPublished;
	/** The entry points of the package in `dir` that are not on disk. */
	missingEntryPoints: (dir: string) => Promise<string[]>;
	publishTo: typeof publishTo;
	/** The wait between two attempts of a transient failure. */
	sleep: (ms: number) => Promise<void>;
	log: (line: string) => void;
	error: (line: string) => void;
};

const defaultDeps: PublishDeps = {
	isPublished,
	missingEntryPoints: (dir) => missingEntryPoints(dir),
	publishTo,
	sleep: (ms) => Bun.sleep(ms),
	log: console.log,
	error: console.error,
};

/** npmjs's refusal of a version it holds, or held and unpublished: never retried. */
const ALREADY_HELD = /cannot publish over the previously published versions?/i;

/**
 * Publishes one package to registry.npmjs.org unless the version is already
 * there (idempotent: a re-run after a partial failure skips what landed). A
 * registry that cannot be asked fails the package. A transient npmjs failure
 * is retried (see `publish-retry.ts`).
 *
 * A version that needs publishing is first checked against the disk: every
 * file its `package.json` points to must exist, else the package fails with
 * nothing published (an unbuilt checkout has no `dist/`).
 *
 * npmjs can answer 404 for a version it already holds: the package document of
 * a new package lags behind its first publish (seen on limix 0.1.0, a run
 * queued behind the tag-triggered one). Its 403 "cannot publish over the
 * previously published versions" is then the registry's own word that the
 * version is taken, so the package is skipped, not failed.
 */
export async function publishPackage(
	pkg: Pkg,
	deps: PublishDeps = defaultDeps,
): Promise<PackageOutcome> {
	const { log, error } = deps;
	const id = `${pkg.name}@${pkg.version}`;
	const fail = { failed: true, published: false, tag: undefined };
	try {
		if (await deps.isPublished(pkg.name, pkg.version, fetch)) {
			log(`  skip      ${id} (already on ${NPMJS.label})`);
			return { failed: false, published: false, tag: undefined };
		}
	} catch (cause) {
		error(`  FAILED    ${id}: ${(cause as Error).message}`);
		return fail;
	}
	const absent = await deps.missingEntryPoints(pkg.dir);
	if (absent.length > 0) {
		error(
			`  FAILED    ${id}: entry points missing (${absent.join(', ')}); ` +
				'run `bun run build` first',
		);
		return fail;
	}
	const { ok, output, landed } = await publishWithRetry(
		pkg,
		NPMJS,
		() => deps.publishTo(pkg.dir),
		{
			sleep: deps.sleep,
			isPublished: (p, r) => deps.isPublished(p.name, p.version, fetch, r),
			log: error,
		},
	);
	if (!ok && !landed && ALREADY_HELD.test(output)) {
		log(`  skip      ${id} (${NPMJS.label} already holds this version)`);
		return { failed: false, published: false, tag: undefined };
	}
	if (!ok && !landed) {
		error(`  FAILED    ${id} on ${NPMJS.label}`);
		error(
			output
				.trim()
				.split('\n')
				.map((l) => `            ${l}`)
				.join('\n'),
		);
		return fail;
	}
	log(`  published ${id} to ${NPMJS.label}`);
	return { failed: false, published: true, tag: id };
}

/** What a whole run came to. */
export type RunTotals = { published: number; failed: number; skipped: number };

/**
 * Publishes `packages` (already in dependency order), announcing each tag.
 * A package whose workspace dependency failed or was skipped earlier in the
 * run is skipped and reported: a dependent must never land on the registry
 * without its dependency.
 */
export async function publishInOrder(
	packages: readonly Pkg[],
	publish: (pkg: Pkg) => Promise<PackageOutcome>,
	announce: (tag: string, packageName: string) => Promise<void>,
	log: (line: string) => void = console.error,
): Promise<RunTotals> {
	const totals: RunTotals = { published: 0, failed: 0, skipped: 0 };
	const blocked = new Set<string>();
	for (const pkg of packages) {
		const dependency = [...pkg.deps].find((d) => blocked.has(d));
		if (dependency) {
			totals.skipped++;
			blocked.add(pkg.name);
			log(
				`  SKIPPED   ${pkg.name}@${pkg.version}: ${dependency} did not publish`,
			);
			continue;
		}
		const outcome = await publish(pkg);
		if (outcome.failed) {
			totals.failed++;
			blocked.add(pkg.name);
		} else if (outcome.published) totals.published++;
		if (outcome.tag) await announce(outcome.tag, pkg.name);
	}
	return totals;
}

export async function announceTag(
	tag: string,
	packageName: string,
	changesetsOutput: string | undefined,
	root: string,
	append: (
		outputPath: string,
		packageName: string,
		tag: string,
	) => Promise<void>,
): Promise<void> {
	// The tag already exists (the release owner pushed it); this local
	// re-tag only keeps the contract that an announced tag exists. `--force`
	// because a re-run after a partial failure must not stop on a tag it
	// already made.
	const tagged = await $`git tag --force ${tag}`.cwd(root).quiet().nothrow();
	if (tagged.exitCode !== 0) {
		console.error(`  warning   could not tag ${tag}`);
		console.error(`            ${tagged.stderr.toString().trim()}`);
	}

	// v1 parsed this stdout line; keep it so a leftover runner still
	// creates GitHub releases. v2 reads `$CHANGESETS_OUTPUT` instead.
	console.log(`New tag: ${tag}`);
	if (changesetsOutput) {
		await append(changesetsOutput, packageName, tag);
	}
}
