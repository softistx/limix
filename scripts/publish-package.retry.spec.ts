import { describe, expect, test } from 'bun:test';
import type { Pkg } from './publish';
import { type PublishDeps, publishPackage } from './publish-package';

const pkg: Pkg = {
	name: '@softistx/x',
	version: '1.0.0',
	dir: '/x',
	deps: new Set(),
};
const packument = { ok: false, output: 'Failed to save packument.' };

/** `registry` answers each ask of the registry in turn (the first is the pre-publish check). */
function setup(
	answers: { ok: boolean; output: string }[],
	registry: boolean[],
) {
	const sleeps: number[] = [];
	let attempts = 0;
	const deps: PublishDeps = {
		isPublished: async () => registry.shift() ?? false,
		missingEntryPoints: async () => [],
		publishTo: async () => {
			attempts++;
			return answers.shift() ?? { ok: true, output: '' };
		},
		sleep: async (ms) => {
			sleeps.push(ms);
		},
		log: () => {},
		error: () => {},
	};
	return { deps, sleeps, attempts: () => attempts };
}

describe('publishPackage, transient npmjs failures', () => {
	test('a failed publish then a success is published and tagged', async () => {
		const s = setup([packument], []);
		expect(await publishPackage(pkg, s.deps)).toEqual({
			failed: false,
			published: true,
			tag: '@softistx/x@1.0.0',
		});
		expect(s.attempts()).toBe(2);
		expect(s.sleeps).toEqual([10_000]);
	});

	test('a publish that landed despite the error counts as published', async () => {
		const s = setup([packument], [false, true]);
		expect((await publishPackage(pkg, s.deps)).published).toBe(true);
		expect(s.attempts()).toBe(1);
	});

	test('a version that landed after the last attempt is published', async () => {
		const s = setup(
			[packument, packument, packument],
			[false, false, false, true],
		);
		expect((await publishPackage(pkg, s.deps)).published).toBe(true);
		expect(s.attempts()).toBe(3);
		expect(s.sleeps).toEqual([10_000, 30_000]);
	});

	test('still failing after 3 attempts is a failure, nothing tagged', async () => {
		const s = setup([packument, packument, packument], []);
		expect(await publishPackage(pkg, s.deps)).toEqual({
			failed: true,
			published: false,
			tag: undefined,
		});
		expect(s.attempts()).toBe(3);
		expect(s.sleeps).toEqual([10_000, 30_000]);
	});

	test('a 403 is not retried', async () => {
		const s = setup([{ ok: false, output: 'E403 Forbidden' }], []);
		expect((await publishPackage(pkg, s.deps)).failed).toBe(true);
		expect(s.attempts()).toBe(1);
		expect(s.sleeps).toEqual([]);
	});
});
