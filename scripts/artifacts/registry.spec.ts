import { describe, expect, spyOn, test } from 'bun:test';
import { onRegistry } from './registry';

describe('onRegistry', () => {
	test('asks npmjs, without a token, for every scope', async () => {
		delete process.env['NPM_TOKEN'];
		delete process.env['NPM_SOFTISTX_READ_TOKEN'];
		const spy = spyOn(globalThis, 'fetch').mockImplementation(
			(async () => new Response(null)) as unknown as typeof fetch,
		);
		try {
			expect(await onRegistry('@softistx/mongo')).toBe(true);
			expect(await onRegistry('@nxgt/i18n-vue')).toBe(true);
			expect(spy.mock.calls[0]).toEqual([
				'https://registry.npmjs.org/@softistx%2Fmongo',
				{ method: 'HEAD', headers: {} },
			]);
			expect(spy.mock.calls[1]?.[0]).toBe(
				'https://registry.npmjs.org/@nxgt%2Fi18n-vue',
			);
		} finally {
			spy.mockRestore();
		}
	});

	test('sends the token when one is set', async () => {
		process.env['NPM_TOKEN'] = 'tok';
		const spy = spyOn(globalThis, 'fetch').mockImplementation(
			(async () => new Response(null)) as unknown as typeof fetch,
		);
		try {
			await onRegistry('@softistx/mongo');
			expect(spy.mock.calls[0]?.[1]).toEqual({
				method: 'HEAD',
				headers: { authorization: 'Bearer tok' },
			});
		} finally {
			spy.mockRestore();
			delete process.env['NPM_TOKEN'];
		}
	});

	test('answers no when the registry cannot be reached', async () => {
		const spy = spyOn(globalThis, 'fetch').mockImplementation((async () => {
			throw new Error('offline');
		}) as unknown as typeof fetch);
		try {
			expect(await onRegistry('@softistx/mongo')).toBe(false);
		} finally {
			spy.mockRestore();
		}
	});
});
