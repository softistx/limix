import { describe, expect, test } from 'bun:test';
import type { Pkg } from './publish';
import { NPMJS } from './publish-registries';
import { type PublishResult, publishWithRetry } from './publish-retry';

const pkg: Pkg = {
	name: '@softistx/redis',
	version: '1.0.0',
	dir: '/x',
	deps: new Set(),
};
const PACKUMENT =
	'Failed to save packument. A common cause is if you try to publish a new package before the previous package has been fully processed.';

function run(answers: PublishResult[], onRegistry: boolean[] = []) {
	const sleeps: number[] = [];
	let calls = 0;
	let reads = 0;
	const promise = publishWithRetry(
		pkg,
		NPMJS,
		async () => answers[Math.min(calls++, answers.length - 1)] as PublishResult,
		{
			sleep: async (ms) => {
				sleeps.push(ms);
			},
			isPublished: async () => onRegistry[reads++] ?? false,
			log: () => {},
		},
	);
	return { promise, sleeps, calls: () => calls, reads: () => reads };
}

describe('publishWithRetry', () => {
	test('a success is returned at once, with no wait', async () => {
		const r = run([{ ok: true, output: '' }]);
		expect(await r.promise).toEqual({ ok: true, output: '', landed: false });
		expect(r.calls()).toBe(1);
		expect(r.sleeps).toEqual([]);
	});

	test('a transient failure then a success: waits 10 s, asks the registry, publishes again', async () => {
		const r = run([
			{ ok: false, output: PACKUMENT },
			{ ok: true, output: '' },
		]);
		const out = await r.promise;
		expect(out.ok).toBe(true);
		expect(out.landed).toBe(false);
		expect(r.calls()).toBe(2);
		expect(r.sleeps).toEqual([10_000]);
		expect(r.reads()).toBe(1);
	});

	test('a publish that landed despite the error is not sent again', async () => {
		const r = run([{ ok: false, output: PACKUMENT }], [true]);
		const out = await r.promise;
		expect(out.landed).toBe(true);
		expect(r.calls()).toBe(1);
	});

	test('a permanent transient failure stops after 3 attempts, waiting 10 s then 30 s', async () => {
		const r = run([{ ok: false, output: 'E503 Service Unavailable' }]);
		const out = await r.promise;
		expect(out.ok).toBe(false);
		expect(out.landed).toBe(false);
		expect(r.calls()).toBe(3);
		expect(r.sleeps).toEqual([10_000, 30_000]);
	});

	test('after the last failed attempt the registry is asked once more, with no wait', async () => {
		const r = run(
			[{ ok: false, output: 'E503 Service Unavailable' }],
			[false, false, true],
		);
		const out = await r.promise;
		expect(out.landed).toBe(true);
		expect(r.calls()).toBe(3);
		expect(r.sleeps).toEqual([10_000, 30_000]);
		expect(r.reads()).toBe(3);
	});

	test('a non-transient failure (403) is not retried', async () => {
		const r = run([{ ok: false, output: 'E403 Forbidden' }]);
		expect((await r.promise).ok).toBe(false);
		expect(r.calls()).toBe(1);
		expect(r.sleeps).toEqual([]);
		expect(r.reads()).toBe(0);
	});

	test('a registry that cannot be read does not stop the retry', async () => {
		let calls = 0;
		const out = await publishWithRetry(
			pkg,
			NPMJS,
			async () =>
				++calls === 1
					? { ok: false, output: PACKUMENT }
					: { ok: true, output: '' },
			{
				sleep: async () => {},
				isPublished: async () => {
					throw new Error('503');
				},
				log: () => {},
			},
		);
		expect(out.ok).toBe(true);
		expect(calls).toBe(2);
	});
});
