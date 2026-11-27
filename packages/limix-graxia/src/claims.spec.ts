import { describe, expect, test } from 'bun:test';
import { claimsOf, onceClaims } from './claims';
import { claims } from './schema.fixtures';

describe('onceClaims', () => {
	test('reads once, however many callers', async () => {
		let reads = 0;
		const once = onceClaims(async () => {
			reads++;
			return claims.admin;
		});
		expect(await Promise.all([once(), once()])).toEqual([
			claims.admin,
			claims.admin,
		]);
		expect(reads).toBe(1);
	});

	test('refuses an answer that is not an object', async () => {
		const once = onceClaims(() => null as never);
		await expect(once()).rejects.toThrow('must return a claims object');
	});
});

describe('claimsOf', () => {
	test('memoises per context object', async () => {
		let reads = 0;
		const read = () => {
			reads++;
			return claims.reader;
		};
		const ctx = {};
		await claimsOf(ctx, read);
		await claimsOf(ctx, read);
		await claimsOf({}, read);
		expect(reads).toBe(2);
	});

	test('prefers the claims the plugin put on the context', async () => {
		const ctx = { limix: { claims: async () => claims.admin } };
		expect(await claimsOf(ctx, () => claims.anon)).toBe(claims.admin);
	});

	test('reads a context that is not an object each time, and checks it', async () => {
		expect(await claimsOf(undefined, () => claims.reader)).toBe(claims.reader);
		await expect(claimsOf({}, () => 'x' as never)).rejects.toThrow(TypeError);
	});
});
