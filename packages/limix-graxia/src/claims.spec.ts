import { describe, expect, test } from 'bun:test';
import { claimsOf, onceClaims, pluginContext, relationsOf } from './claims';
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
	test('without the plugin it reads on every call, so a reused context is read afresh', async () => {
		const ctx = { user: 'a' };
		const read = (c: typeof ctx) =>
			c.user === 'a' ? claims.reader : claims.admin;
		expect(await claimsOf(ctx, read)).toBe(claims.reader);
		ctx.user = 'b';
		expect(await claimsOf(ctx, read)).toBe(claims.admin);
		let reads = 0;
		const counted = () => {
			reads++;
			return claims.reader;
		};
		await claimsOf(ctx, counted);
		await claimsOf(ctx, counted);
		expect(reads).toBe(2);
	});

	test('with the plugin it reads once per context it made', async () => {
		let reads = 0;
		const ctx = pluginContext(
			() => {
				reads++;
				return claims.admin;
			},
			() => undefined,
		);
		expect(await claimsOf(ctx, () => claims.anon)).toBe(claims.admin);
		await claimsOf(ctx, () => claims.anon);
		expect(reads).toBe(1);
	});

	test('ignores a ctx.limix the plugin did not make', async () => {
		const ctx = { limix: { claims: async () => claims.admin } };
		expect(await claimsOf(ctx, () => claims.anon)).toBe(claims.anon);
	});

	test('reads a context that is not an object each time, and checks it', async () => {
		expect(await claimsOf(undefined, () => claims.reader)).toBe(claims.reader);
		await expect(claimsOf({}, () => 'x' as never)).rejects.toThrow(TypeError);
	});
});

describe('relationsOf', () => {
	const checker = { check: async () => [] };

	test('a plain checker is passed as it is', () => {
		expect(relationsOf({}, checker)).toBe(checker);
		expect(relationsOf({}, undefined)).toBeUndefined();
	});

	test('a function is called per resolution without the plugin', () => {
		let calls = 0;
		const make = () => {
			calls++;
			return checker;
		};
		const ctx = {};
		relationsOf(ctx, make);
		relationsOf(ctx, make);
		expect(calls).toBe(2);
	});

	test('with the plugin it is called once per context it made', () => {
		let calls = 0;
		const ctx = pluginContext(
			() => claims.admin,
			() => {
				calls++;
				return checker;
			},
		);
		const make = () => checker;
		expect(relationsOf(ctx, make)).toBe(checker);
		relationsOf(ctx, make);
		expect(calls).toBe(1);
	});
});
