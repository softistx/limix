import { afterAll, describe, expect, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cleanupOnSignal, withPublishRegistry } from './publish-registries';
import {
	cleanTempDirs,
	manifestDir,
	npmjs,
	trackedDir,
} from './publish-registries.fixtures';

afterAll(cleanTempDirs);

describe('withPublishRegistry', () => {
	const read = (dir: string) => readFile(join(dir, 'package.json'), 'utf8');
	const publishConfigOf = async (dir: string) =>
		(JSON.parse(await read(dir)) as { publishConfig: unknown }).publishConfig;

	test('points publishConfig.registry at the target, keeping the rest', async () => {
		const dir = await manifestDir();
		const seen = await withPublishRegistry(dir, npmjs.url, () =>
			publishConfigOf(dir),
		);
		expect(seen).toEqual({ registry: npmjs.url, access: 'public' });
	});

	test('restores the manifest byte for byte after a success', async () => {
		const dir = await manifestDir();
		const before = await read(dir);
		await withPublishRegistry(dir, npmjs.url, async () => 1);
		expect(await read(dir)).toBe(before);
	});

	test('restores the manifest after an error', async () => {
		const dir = await manifestDir();
		const before = await read(dir);
		await expect(
			withPublishRegistry(dir, npmjs.url, async () => {
				throw new Error('publish failed');
			}),
		).rejects.toThrow('publish failed');
		expect(await read(dir)).toBe(before);
	});
});

describe('an interrupt', () => {
	/** Emits `signal` with `process.exit` recorded instead of leaving. */
	function interrupt(signal: 'SIGINT' | 'SIGTERM'): number | undefined {
		const realExit = process.exit;
		let code: number | undefined;
		process.exit = ((c?: number) => {
			code = c;
		}) as typeof process.exit;
		try {
			process.emit(signal);
		} finally {
			process.exit = realExit;
		}
		return code;
	}

	test('puts the manifest back synchronously and exits 128 + the signal', async () => {
		for (const [signal, expected] of [
			['SIGINT', 130],
			['SIGTERM', 143],
		] as const) {
			const dir = await trackedDir();
			const path = join(dir, 'package.json');
			const original = `${JSON.stringify({ name: '@softistx/x', publishConfig: { registry: 'https://example.invalid/' } }, null, '\t')}\n`;
			await writeFile(path, original);
			let release = () => {};
			const held = new Promise<void>((resolve) => {
				release = resolve;
			});
			let during = '';
			const running = withPublishRegistry(dir, npmjs.url, async () => {
				during = await readFile(path, 'utf8');
				await held;
			});
			await Bun.sleep(20);
			expect(during).not.toBe(original);
			expect(interrupt(signal)).toBe(expected);
			expect(await readFile(path, 'utf8')).toBe(original);
			release();
			await running;
		}
	});

	test('removes its listeners with the last cleanup', () => {
		const before = process.listenerCount('SIGTERM');
		const first = cleanupOnSignal(() => {});
		const second = cleanupOnSignal(() => {});
		expect(process.listenerCount('SIGTERM')).toBe(before + 1);
		first();
		expect(process.listenerCount('SIGTERM')).toBe(before + 1);
		second();
		expect(process.listenerCount('SIGTERM')).toBe(before);
	});
});
