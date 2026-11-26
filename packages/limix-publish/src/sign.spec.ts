import { describe, expect, it } from 'bun:test';
import { RulesError } from '@softistx/limix';
import { RemotePolicyError, verifyRules } from '@softistx/limix/remote';
import {
	decodeJwt,
	decodeProtectedHeader,
	exportPKCS8,
	generateKeyPair,
} from 'jose';
import {
	type Alg,
	generateSigningKeyPair,
	importSigningKey,
	jwksOf,
	PublishError,
	signRules,
} from './index';
import { pairFor, RULES, small, T0 } from './keys.fixtures';

const ALGS: Alg[] = ['ES256', 'EdDSA', 'RS256', 'PS256'];

const base = async (alg: Alg = 'ES256') => {
	const { privateKey, publicKey } = await pairFor(alg);
	return {
		privateKey,
		publicKey,
		options: {
			key: privateKey,
			alg,
			kid: 'k1',
			audience: 'svc',
			ver: 1,
			now: () => T0,
		},
	};
};

describe('signRules', () => {
	for (const alg of ALGS) {
		it(`round-trips ${alg} through verifyRules`, async () => {
			const { options, publicKey } = await base(alg);
			const token = await signRules(RULES, { ...options, issuer: 'https://p' });
			const jwks = await jwksOf([{ key: publicKey, kid: 'k1', alg }]);
			const verified = await verifyRules(token, jwks, {
				audience: 'svc',
				issuer: 'https://p',
				now: () => T0,
			});
			expect(verified.ver).toBe(1);
			expect(verified.schema).toBe(1);
			expect(verified.exp).toBe(T0 / 1000 + 86_400);
			expect(decodeProtectedHeader(token)).toEqual({
				alg,
				typ: 'limix-rules+jwt',
				kid: 'k1',
			});
		});
	}

	it('writes the claims a reader requires', async () => {
		const { options } = await base();
		const claims = decodeJwt(
			await signRules(RULES, {
				...options,
				audience: ['a', 'b'],
				expiresIn: 60,
				ver: 7,
			}),
		);
		expect(claims).toMatchObject({
			ver: 7,
			schema: 1,
			iat: T0 / 1000,
			exp: T0 / 1000 + 60,
			aud: ['a', 'b'],
		});
		expect(claims.iss).toBeUndefined();
	});

	it('drops x- anchor keys, like a reader', async () => {
		const { options } = await base();
		const claims = decodeJwt(
			await signRules(
				{ ...RULES, 'x-common': { roles: [['admin']] } },
				options,
			),
		);
		expect(Object.keys(claims['rules'] as object)).not.toContain('x-common');
	});

	it('accepts a custom typ', async () => {
		const { options } = await base();
		const token = await signRules(RULES, { ...options, typ: 'mine+jwt' });
		expect(decodeProtectedHeader(token).typ).toBe('mine+jwt');
	});

	describe('refusals', () => {
		const refused = async (
			rules: unknown,
			options: Record<string, unknown>,
			alg: Alg = 'ES256',
		) => {
			const { options: defaults } = await base(alg);
			return signRules(rules, { ...defaults, ...options } as never).catch(
				(e) => e,
			);
		};

		it('refuses an HS256 algorithm', async () => {
			const error = await refused(RULES, { alg: 'HS256' });
			expect(error).toBeInstanceOf(PublishError);
			expect(error.code).toBe('OPTIONS');
			expect(error.message).toContain('asymmetric only');
		});

		it('refuses a shared secret key', async () => {
			const secret = await crypto.subtle.generateKey(
				{ name: 'HMAC', hash: 'SHA-256' },
				true,
				['sign'],
			);
			const error = await refused(RULES, { key: secret });
			expect(error).toBeInstanceOf(PublishError);
			expect(error.code).toBe('KEY');
			expect(error.message).toContain('shared secret');
		});

		it('refuses a key that is not a CryptoKey', async () => {
			const error = await refused(RULES, { key: new Uint8Array(32) });
			expect(error.code).toBe('KEY');
		});

		it('refuses a public key', async () => {
			const { publicKey } = await base();
			const error = await refused(RULES, { key: publicKey });
			expect(error.code).toBe('KEY');
			expect(error.message).toContain('private key');
		});

		it('refuses an empty kid', async () => {
			for (const kid of ['', '  ']) {
				const error = await refused(RULES, { kid });
				expect(error.code).toBe('OPTIONS');
				expect(error.message).toContain('kid');
			}
		});

		it('refuses a ver that is not a positive integer', async () => {
			for (const ver of [0, 1.5, -1, Number.NaN, '2']) {
				const error = await refused(RULES, { ver });
				expect(error.code).toBe('OPTIONS');
				expect(error.message).toContain('ver');
			}
		});

		it('refuses an expiresIn that is not a positive integer', async () => {
			for (const expiresIn of [0, -5, 1.5, Number.POSITIVE_INFINITY]) {
				const error = await refused(RULES, { expiresIn });
				expect(error.code).toBe('OPTIONS');
				expect(error.message).toContain('expiresIn');
			}
		});

		it('refuses an empty audience', async () => {
			for (const audience of ['', [], ['a', '']]) {
				expect((await refused(RULES, { audience })).code).toBe('OPTIONS');
			}
		});

		it('refuses a key that does not fit the alg', async () => {
			const ec = await base('ES256');
			const ed = await base('EdDSA');
			const rsa = await base('RS256');
			const cases: [Alg, CryptoKey][] = [
				['EdDSA', ec.privateKey],
				['ES256', ed.privateKey],
				['RS256', ec.privateKey],
				['PS256', rsa.privateKey],
				['RS256', (await base('PS256')).privateKey],
				['ES256', rsa.privateKey],
			];
			for (const [alg, key] of cases) {
				const error = await refused(RULES, { alg, key });
				expect(error).toBeInstanceOf(PublishError);
				expect(error.code).toBe('KEY');
				expect(error.message).toContain(`does not fit ${alg}`);
			}
		});

		it('refuses an EC key on another curve', async () => {
			const { privateKey } = await generateKeyPair('ES384', {
				extractable: true,
			});
			const error = await refused(RULES, { key: privateKey });
			expect(error.code).toBe('KEY');
		});

		it('refuses an RSA key under 2048 bits', async () => {
			const { privateKey } = await small();
			const error = await refused(RULES, { key: privateKey, alg: 'RS256' });
			expect(error.code).toBe('KEY');
		});

		it('refuses malformed rules with the core RulesError', async () => {
			const error = await refused({ limix: 1 }, {});
			expect(error).toBeInstanceOf(RulesError);
		});

		it('refuses a condition outside `conditions` when given', async () => {
			const rules = {
				...RULES,
				rest: { '/a': { GET: { authenticated: true, when: ['nope'] } } },
			};
			const error = await refused(rules, { conditions: ['other'] });
			expect(error).toBeInstanceOf(RulesError);
			expect(error.message).toContain('nope');
		});

		it('signs a named condition when it is listed, or when none is given', async () => {
			const rules = {
				...RULES,
				rest: { '/a': { GET: { authenticated: true, when: ['nope'] } } },
			};
			const { options } = await base();
			expect(await signRules(rules, options)).toContain('.');
			expect(
				await signRules(rules, { ...options, conditions: ['nope'] }),
			).toContain('.');
		});

		it('refuses a rule naming a condition inside a GraphQL field when conditions is given', async () => {
			const rules = {
				limix: 1,
				global: { unmatched: 'deny' },
				graphql: { Query: { me: { authenticated: true, when: ['x'] } } },
			};
			const error = await refused(rules, { conditions: [] });
			expect(error).toBeInstanceOf(RulesError);
		});

		it('is verified by the reader as the same refusal when signed anyway', async () => {
			// A token signed for another audience is refused by verifyRules.
			const { options, publicKey } = await base();
			const token = await signRules(RULES, options);
			const jwks = await jwksOf([{ key: publicKey, kid: 'k1', alg: 'ES256' }]);
			const error = await verifyRules(token, jwks, {
				audience: 'other',
				now: () => T0,
			}).catch((e) => e);
			expect(error).toBeInstanceOf(RemotePolicyError);
			expect(error.code).toBe('CLAIMS');
		});
	});
});

describe('importSigningKey and generateSigningKeyPair', () => {
	for (const alg of ALGS) {
		it(`generates a ${alg} pair that signs, with an exportable public key`, async () => {
			const pair = await generateSigningKeyPair(alg);
			const token = await signRules(RULES, {
				key: pair.privateKey,
				alg,
				kid: 'k',
				audience: 'svc',
				ver: 1,
				now: () => T0,
			});
			const jwks = await jwksOf([{ key: pair.publicKey, kid: 'k', alg }]);
			expect(
				(await verifyRules(token, jwks, { audience: 'svc', now: () => T0 }))
					.ver,
			).toBe(1);
			expect(pair.privateKey.extractable).toBe(false);
		});
	}

	it('imports a PKCS#8 PEM', async () => {
		const { privateKey } = await pairFor('ES256');
		const pem = await exportPKCS8(privateKey);
		const key = await importSigningKey(pem, 'ES256');
		expect(key.type).toBe('private');
	});

	it('refuses an alg outside the four, garbage and a PKCS#1 PEM', async () => {
		const { privateKey } = await pairFor('ES256');
		const pem = await exportPKCS8(privateKey);
		const bad = (pem: string, alg: string) =>
			importSigningKey(pem, alg as Alg).catch((e) => e);
		expect((await bad(pem, 'HS256')).code).toBe('OPTIONS');
		expect((await bad('nope', 'ES256')).code).toBe('KEY');
		const old = await bad(
			'-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----',
			'RS256',
		);
		expect(old).toBeInstanceOf(PublishError);
		expect(old.message).toContain('openssl pkcs8 -topk8 -nocrypt');
	});
});
