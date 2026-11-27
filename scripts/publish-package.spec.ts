import { describe, expect, test } from 'bun:test';
import type { Pkg } from './publish';
import {
	type PublishDeps,
	publishInOrder,
	publishPackage,
} from './publish-package';

describe('publishPackage', () => {
	const pkg: Pkg = {
		name: '@softistx/x',
		version: '1.0.0',
		dir: '/x',
		deps: new Set(),
	};

	/** `onNpm`: the version is already there; `refusing`: the publish fails. */
	function setup(
		onNpm: boolean,
		refusing = false,
		absent: string[] = [],
		refusal = 'denied',
	) {
		let published = 0;
		const errors: string[] = [];
		const logs: string[] = [];
		const deps: PublishDeps = {
			isPublished: async () => onNpm,
			missingEntryPoints: async () => absent,
			publishTo: async () => {
				published++;
				return { ok: !refusing, output: refusing ? refusal : '' };
			},
			sleep: async () => {},
			log: (line) => logs.push(line),
			error: (line) => errors.push(line),
		};
		return { deps, published: () => published, errors, logs };
	}

	test('missing on npmjs, accepted: published and tagged', async () => {
		const { deps, published } = setup(false);
		expect(await publishPackage(pkg, deps)).toEqual({
			failed: false,
			published: true,
			tag: '@softistx/x@1.0.0',
		});
		expect(published()).toBe(1);
	});

	test('missing entry points: failed, nothing published, says to build', async () => {
		const { deps, published, errors } = setup(false, false, ['dist/index.js']);
		expect(await publishPackage(pkg, deps)).toEqual({
			failed: true,
			published: false,
			tag: undefined,
		});
		expect(published()).toBe(0);
		expect(errors.join('\n')).toContain('@softistx/x@1.0.0');
		expect(errors.join('\n')).toContain('dist/index.js');
		expect(errors.join('\n')).toContain('bun run build');
	});

	test('a version already on npmjs is skipped without checking the disk', async () => {
		const { deps, published } = setup(true, false, ['dist/index.js']);
		expect(await publishPackage(pkg, deps)).toEqual({
			failed: false,
			published: false,
			tag: undefined,
		});
		expect(published()).toBe(0);
	});

	test('npmjs refuses: failed, not tagged, the output shown', async () => {
		const { deps, errors } = setup(false, true);
		expect(await publishPackage(pkg, deps)).toEqual({
			failed: true,
			published: false,
			tag: undefined,
		});
		expect(errors.join('\n')).toContain('FAILED    @softistx/x@1.0.0 on npmjs');
		expect(errors.join('\n')).toContain('denied');
	});

	test('npmjs already holds the version it said was missing: skipped, not failed', async () => {
		const { deps, published, errors, logs } = setup(
			false,
			true,
			[],
			'403 Forbidden - You cannot publish over the previously published versions: 1.0.0.',
		);
		expect(await publishPackage(pkg, deps)).toEqual({
			failed: false,
			published: false,
			tag: undefined,
		});
		expect(published()).toBe(1);
		expect(errors).toEqual([]);
		expect(logs.join('\n')).toContain('refuses it as already published');
	});

	test('any other 403 still fails the package', async () => {
		const { deps, errors } = setup(
			false,
			true,
			[],
			'403 Forbidden - PUT https://registry.npmjs.org/@softistx%2fx',
		);
		expect((await publishPackage(pkg, deps)).failed).toBe(true);
		expect(errors[0]).toContain('FAILED');
	});

	test('a registry that cannot be asked fails the package and publishes nothing', async () => {
		const { deps, published, errors } = setup(false);
		deps.isPublished = async () => {
			throw new Error('npmjs answered an unreadable document');
		};
		expect(await publishPackage(pkg, deps)).toEqual({
			failed: true,
			published: false,
			tag: undefined,
		});
		expect(published()).toBe(0);
		expect(errors[0]).toContain('unreadable document');
	});
});

describe('publishInOrder', () => {
	const mk = (name: string, ...deps: string[]): Pkg => ({
		name,
		version: '1.0.0',
		dir: `/${name}`,
		deps: new Set(deps),
	});
	const ok = { failed: false, published: true, tag: undefined };

	test('a dependent of a failed package is skipped, not published, and reported', async () => {
		const seen: string[] = [];
		const logs: string[] = [];
		const totals = await publishInOrder(
			[mk('a'), mk('b', 'a'), mk('c', 'b'), mk('d')],
			async (pkg) => {
				seen.push(pkg.name);
				return pkg.name === 'a'
					? { ...ok, failed: true, published: false }
					: ok;
			},
			async () => {},
			(line) => logs.push(line),
		);
		expect(seen).toEqual(['a', 'd']);
		expect(totals).toEqual({ published: 1, failed: 1, skipped: 2 });
		expect(logs.join('\n')).toContain('SKIPPED   b@1.0.0: a did not publish');
		expect(logs.join('\n')).toContain('SKIPPED   c@1.0.0: b did not publish');
	});

	test('announces the tags of the packages that published', async () => {
		const tags: string[] = [];
		await publishInOrder(
			[mk('a')],
			async () => ({ ...ok, tag: 'a@1.0.0' }),
			async (tag) => {
				tags.push(tag);
			},
		);
		expect(tags).toEqual(['a@1.0.0']);
	});
});
