import { generateKeyPair } from 'jose';
import type { Alg } from './keys/assert';

export const T0 = 1_800_000_000_000;

export const RULES = {
	limix: 1,
	global: { unmatched: 'deny' },
	rest: {
		'/open': { GET: { public: true } },
		'/billing': { GET: { roles: [['admin']] } },
	},
} as const;

const GENERATE: Record<Alg, Parameters<typeof generateKeyPair>[1]> = {
	ES256: { extractable: true },
	EdDSA: { extractable: true, crv: 'Ed25519' },
	RS256: { extractable: true, modulusLength: 2048 },
	PS256: { extractable: true, modulusLength: 2048 },
};

/** An extractable key pair that fits `alg`. */
export async function pairFor(alg: Alg) {
	return generateKeyPair(alg, GENERATE[alg]);
}

/** A 1024-bit RSA pair, which jose will not generate. */
export async function small() {
	return crypto.subtle.generateKey(
		{
			name: 'RSASSA-PKCS1-v1_5',
			modulusLength: 1024,
			publicExponent: new Uint8Array([1, 0, 1]),
			hash: 'SHA-256',
		},
		true,
		['sign', 'verify'],
	) as Promise<CryptoKeyPair>;
}
