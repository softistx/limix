/**
 * The only module that imports `jose`: when the repository moves to its
 * in-house JWS package (softistx/limix#22), this file is what changes.
 */
import {
	exportJWK,
	generateKeyPair,
	importPKCS8,
	type JSONWebKeySet,
	type JWK,
	type JWTPayload,
	SignJWT,
} from 'jose';
import type { Alg } from './keys/assert';

export type { JSONWebKeySet, JWK };

/** Signs `claims` as a compact JWS; `claims` already holds `iat`, `exp`, `aud`. */
export async function signCompact(
	claims: JWTPayload,
	header: { alg: string; typ: string; kid: string },
	key: CryptoKey,
): Promise<string> {
	return new SignJWT(claims).setProtectedHeader(header).sign(key);
}

/** The JWK form of an extractable key. */
export function exportKey(key: CryptoKey): Promise<JWK> {
	return exportJWK(key);
}

/** Imports a PKCS#8 private key PEM (`BEGIN PRIVATE KEY`) for `alg`. */
export function importPem(pem: string, alg: Alg): Promise<CryptoKey> {
	return importPKCS8(pem, alg);
}

/**
 * A new key pair for `alg`: the private key cannot be exported, the public one
 * can. RSA keys have 2048 bits.
 */
export function generatePair(alg: Alg): Promise<CryptoKeyPair> {
	return generateKeyPair(alg, {
		extractable: false,
		...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}),
		...(alg === 'RS256' || alg === 'PS256' ? { modulusLength: 2048 } : {}),
	}) as Promise<CryptoKeyPair>;
}
