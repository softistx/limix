import { PublishError } from '../errors';
import { exportKey, type JSONWebKeySet, type JWK } from '../jose';
import { type Alg, assertAlg, assertKid } from './assert';
import { checkCryptoKey, checkJwk, isCryptoKey } from './fit';

/** A key of the set `jwksOf` publishes. */
export interface JwksKey {
	/** A public or private key; only its public part is kept. */
	key: CryptoKey | JWK;
	kid: string;
	alg: Alg;
}

const PRIVATE_MEMBERS = ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'oth'] as const;

/** The public members of a JWK by key type, so nothing else is copied. */
const PUBLIC_MEMBERS: Record<string, readonly (keyof JWK)[]> = {
	EC: ['kty', 'crv', 'x', 'y'],
	OKP: ['kty', 'crv', 'x'],
	RSA: ['kty', 'n', 'e'],
};

function publicMembers(jwk: JWK): JWK {
	const names = PUBLIC_MEMBERS[jwk.kty ?? ''] ?? [];
	const out: JWK = {};
	for (const name of names) {
		if (jwk[name] !== undefined) out[name] = jwk[name] as never;
	}
	return out;
}

async function publicJwk(key: JwksKey): Promise<JWK> {
	let jwk: JWK;
	if (isCryptoKey(key.key)) {
		checkCryptoKey(key.key, key.alg);
		if (!key.key.extractable) {
			throw new PublishError(
				'KEY',
				`key "${key.kid}" cannot be exported (not extractable): give its public key, or import it with extractable: true`,
			);
		}
		jwk = await exportKey(key.key);
	} else if (typeof key.key === 'object' && key.key !== null) {
		jwk = { ...key.key };
	} else {
		throw new PublishError(
			'KEY',
			`key "${key.kid}" must be a CryptoKey or a JWK`,
		);
	}
	checkJwk(jwk, key.alg);
	return { ...publicMembers(jwk), kid: key.kid, alg: key.alg, use: 'sig' };
}

/**
 * The key set readers fetch (`jwksUri`): the public part of each key, with
 * `kid`, `alg` and `use: "sig"`. A private key or JWK is stripped of its
 * private members. Refuses an empty list, a duplicate `kid`, an `oct` key and a
 * key that does not fit its `alg` (ES256 EC P-256, EdDSA Ed25519, RS256 and
 * PS256 RSA of 2048 bits or more). Serve two keys at once to rotate.
 */
export async function jwksOf(
	keys: ReadonlyArray<JwksKey>,
): Promise<JSONWebKeySet> {
	if (!Array.isArray(keys) || keys.length === 0) {
		throw new PublishError('OPTIONS', 'a key set needs at least one key');
	}
	const seen = new Set<string>();
	const members: JWK[] = [];
	for (const entry of keys) {
		assertKid(entry.kid);
		assertAlg(entry.alg);
		if (seen.has(entry.kid)) {
			throw new PublishError('OPTIONS', `duplicate kid "${entry.kid}"`);
		}
		seen.add(entry.kid);
		members.push(await publicJwk(entry));
	}
	return { keys: members };
}

/** True when a JWK carries any private member. */
export function hasPrivateMembers(jwk: JWK): boolean {
	return PRIVATE_MEMBERS.some((member) => member in jwk);
}

/** True when a JWK says it is not for verifying (`key_ops` without `verify`). */
export function cannotVerify(jwk: JWK): boolean {
	return Array.isArray(jwk.key_ops) && !jwk.key_ops.includes('verify');
}
