import { describe, expect, test } from 'bun:test';
import { isPublished, NPMJS } from './publish-registries';
import {
	npmjs,
	registries,
	TOKEN,
	withTokens,
} from './publish-registries.fixtures';

describe('NPMJS', () => {
	test('is registry.npmjs.org, authenticated with $NPM_TOKEN, and the only registry', () => {
		expect([NPMJS.url, NPMJS.tokenEnv]).toEqual([
			'https://registry.npmjs.org/',
			'NPM_TOKEN',
		]);
	});
});

describe('isPublished', () => {
	const answer = (status: number, body: unknown = {}) =>
		(async () =>
			new Response(JSON.stringify(body), {
				status,
			})) as unknown as typeof fetch;
	const ask = (fetcher: typeof fetch) =>
		withTokens(TOKEN, () => isPublished('@softistx/janus', '1.0.0', fetcher));

	test('fails fast when the token is unset, naming it', async () => {
		await expect(
			withTokens({ [npmjs.tokenEnv]: undefined }, () =>
				isPublished('@softistx/janus', '1.0.0', answer(200)),
			),
		).rejects.toThrow(`${npmjs.tokenEnv} is unset`);
	});

	test('a 404 means never published', async () => {
		expect(await ask(answer(404))).toBe(false);
	});

	test('a 401 or 403 throws instead of answering no, naming the registry', async () => {
		for (const status of [401, 403]) {
			await expect(ask(answer(status))).rejects.toThrow(
				`npmjs answered ${status}`,
			);
		}
	});

	test('a 5xx throws', async () => {
		await expect(ask(answer(503))).rejects.toThrow('npmjs answered 503');
	});

	test('an unreachable registry throws', async () => {
		const down = (async () => {
			throw new Error('connection refused');
		}) as unknown as typeof fetch;
		await expect(ask(down)).rejects.toThrow(
			'npmjs did not answer (connection refused)',
		);
	});

	test('an unreadable document throws', async () => {
		await expect(ask(answer(200, { nope: 1 }))).rejects.toThrow(
			'npmjs answered an unreadable document',
		);
	});

	test('asks npmjs its own url, with the token', async () => {
		const calls: [string, string | null][] = [];
		const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
			calls.push([
				String(input),
				new Headers(init?.headers).get('authorization'),
			]);
			return new Response('{}', { status: 404 });
		}) as unknown as typeof fetch;
		await ask(spy);
		expect(calls).toEqual([
			['https://registry.npmjs.org/@softistx%2Fjanus', 'Bearer a'],
		]);
	});

	test('finds the exact version in the document', async () => {
		const fetcher = registries({ 'registry.npmjs.org': ['0.9.0', '1.0.0'] });
		expect(await ask(fetcher)).toBe(true);
		expect(
			await withTokens(TOKEN, () =>
				isPublished('@softistx/janus', '1.1.0', fetcher),
			),
		).toBe(false);
	});
});
