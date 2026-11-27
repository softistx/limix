import { describe, expect, it } from 'bun:test';
import { verifyRules } from '@softistx/limix/remote';
import { exportJWK, generateKeyPair } from 'jose';
import { type Alg, jwksOf, PublishError, signRules } from './index';
import { pairFor, RULES, small, T0 } from './keys.fixtures';

const PRIVATE = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k'];
const ALGS: Alg[] = ['ES256', 'EdDSA', 'RS256', 'PS256'];

describe('jwksOf', () => {
	for (const alg of ALGS) {
		it(`keeps the public part of a ${alg} public key, with kid, alg and use`, async () => {
			const { publicKey } = await pairFor(alg);
			const { keys } = await jwksOf([{ key: publicKey, kid: 'k1', alg }]);
			expect(keys).toHaveLength(1);
			expect(keys[0]).toMatchObject({ kid: 'k1', alg, use: 'sig' });
			expect(keys[0]).toEqual({
				...(await exportJWK(publicKey)),
				kid: 'k1',
				alg,
				use: 'sig',
			});
			for (const member of PRIVATE) expect(keys[0]).not.toHaveProperty(member);
		});

		it(`strips the private part of a ${alg} private CryptoKey and JWK`, async () => {
			const { privateKey, publicKey } = await pairFor(alg);
			const expected = await exportJWK(publicKey);
			const fromKey = await jwksOf([{ key: privateKey, kid: 'k1', alg }]);
			const fromJwk = await jwksOf([
				{ key: await exportJWK(privateKey), kid: 'k1', alg },
			]);
			for (const set of [fromKey, fromJwk]) {
				expect(JSON.stringify(set)).not.toMatch(/"(d|p|q|dp|dq|qi|k)":/);
				expect(set.keys[0]).toEqual({
					...expected,
					kid: 'k1',
					alg,
					use: 'sig',
				});
			}
		});
	}

	it('lists two keys for a rotation', async () => {
		const a = await pairFor('ES256');
		const b = await pairFor('EdDSA');
		const { keys } = await jwksOf([
			{ key: a.publicKey, kid: 'old', alg: 'ES256' },
			{ key: b.publicKey, kid: 'new', alg: 'EdDSA' },
		]);
		expect(keys.map((key) => key.kid)).toEqual(['old', 'new']);
	});

	it('refuses an empty list', async () => {
		expect(jwksOf([])).rejects.toBeInstanceOf(PublishError);
	});

	it('refuses a duplicate kid', async () => {
		const { publicKey } = await pairFor('ES256');
		const error = await jwksOf([
			{ key: publicKey, kid: 'k', alg: 'ES256' },
			{ key: publicKey, kid: 'k', alg: 'ES256' },
		]).catch((e) => e);
		expect(error).toBeInstanceOf(PublishError);
		expect(error.message).toContain('duplicate kid "k"');
	});

	it('refuses an empty kid', async () => {
		const { publicKey } = await pairFor('ES256');
		expect(
			jwksOf([{ key: publicKey, kid: '', alg: 'ES256' }]),
		).rejects.toBeInstanceOf(PublishError);
	});

	it('refuses an oct JWK and a secret CryptoKey', async () => {
		const secret = await crypto.subtle.generateKey(
			{ name: 'HMAC', hash: 'SHA-256' },
			true,
			['sign'],
		);
		for (const key of [
			{ kty: 'oct', k: 'AAAA' },
			await exportJWK(secret),
			secret,
		]) {
			const error = await jwksOf([
				{ key: key as never, kid: 'k', alg: 'ES256' },
			]).catch((e) => e);
			expect(error).toBeInstanceOf(PublishError);
			expect(error.code).toBe('KEY');
		}
	});

	it('refuses an HS256 alg', async () => {
		const { publicKey } = await pairFor('ES256');
		const error = await jwksOf([
			{ key: publicKey, kid: 'k', alg: 'HS256' as never },
		]).catch((e) => e);
		expect(error.code).toBe('OPTIONS');
	});

	it('refuses an alg that does not fit the key', async () => {
		const ec = await pairFor('ES256');
		const ed = await pairFor('EdDSA');
		const rsa = await pairFor('RS256');
		const cases: [CryptoKey, Alg][] = [
			[ec.publicKey, 'EdDSA'],
			[ed.publicKey, 'ES256'],
			[rsa.publicKey, 'ES256'],
			[ec.publicKey, 'RS256'],
		];
		for (const [key, alg] of cases) {
			const error = await jwksOf([{ key, kid: 'k', alg }]).catch((e) => e);
			expect(error.code).toBe('KEY');
			expect(error.message).toContain(`does not fit ${alg}`);
		}
		const jwk = await exportJWK(ec.publicKey);
		expect(
			jwksOf([{ key: jwk, kid: 'k', alg: 'EdDSA' }]),
		).rejects.toBeInstanceOf(PublishError);
	});

	it('refuses an RSA key under 2048 bits', async () => {
		const { publicKey } = await small();
		const error = await jwksOf([
			{ key: publicKey, kid: 'k', alg: 'RS256' },
		]).catch((e) => e);
		expect(error.code).toBe('KEY');
	});

	it('refuses a private CryptoKey that cannot be exported', async () => {
		const { privateKey } = await generateKeyPair('ES256');
		const error = await jwksOf([
			{ key: privateKey, kid: 'k', alg: 'ES256' },
		]).catch((e) => e);
		expect(error.code).toBe('KEY');
		expect(error.message).toContain('not extractable');
	});
});

describe('jwksOf from a JWK that carries extra members', () => {
	it('keeps only the public members, so key_ops and ext never leak', async () => {
		const { publicKey } = await pairFor('ES256');
		const jwk = {
			...(await exportJWK(publicKey)),
			key_ops: ['sign'],
			ext: true,
			use: 'enc',
			x5c: ['AAAA'],
		};
		const { keys } = await jwksOf([{ key: jwk, kid: 'k', alg: 'ES256' }]);
		expect(keys).toEqual([
			{
				kty: 'EC',
				crv: 'P-256',
				x: jwk.x as string,
				y: jwk.y as string,
				kid: 'k',
				alg: 'ES256',
				use: 'sig',
			},
		]);
	});

	it('gives a set that verifies a token', async () => {
		const { privateKey, publicKey } = await pairFor('ES256');
		const jwk = {
			...(await exportJWK(publicKey)),
			key_ops: ['sign'],
			ext: false,
		};
		const jwks = await jwksOf([{ key: jwk, kid: 'k', alg: 'ES256' }]);
		const token = await signRules(RULES, {
			key: privateKey,
			alg: 'ES256',
			kid: 'k',
			audience: 'svc',
			ver: 1,
			now: () => T0,
		});
		const verified = await verifyRules(token, jwks, {
			audience: 'svc',
			now: () => T0,
		});
		expect(verified.ver).toBe(1);
	});
});
