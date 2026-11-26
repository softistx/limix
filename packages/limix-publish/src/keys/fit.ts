import { PublishError } from '../errors';
import type { JWK } from '../jose';
import { ALGS, type Alg } from './assert';

export const isCryptoKey = (key: unknown): key is CryptoKey =>
	typeof key === 'object' &&
	key !== null &&
	'type' in key &&
	'algorithm' in key &&
	'usages' in key;

function describeAlgorithm(algorithm: KeyAlgorithm): string {
	const { namedCurve, modulusLength } = algorithm as {
		namedCurve?: string;
		modulusLength?: number;
	};
	if (namedCurve) return `${algorithm.name} ${namedCurve}`;
	if (modulusLength) return `${algorithm.name} ${modulusLength} bits`;
	return algorithm.name;
}

/** The member `kty` and curve or size a given `alg` needs, as a message. */
const NEEDS: Record<Alg, string> = {
	ES256: 'an EC P-256 key',
	EdDSA: 'an Ed25519 key',
	RS256: 'an RSA key of 2048 bits or more',
	PS256: 'an RSA key of 2048 bits or more',
};

function mismatch(alg: Alg, found: string): PublishError {
	return new PublishError(
		'KEY',
		`the key is ${found}, which does not fit ${alg}: ${alg} needs ${NEEDS[alg]}`,
	);
}

export function checkCryptoKey(key: CryptoKey, alg: Alg): void {
	const algorithm = key.algorithm as KeyAlgorithm & {
		namedCurve?: string;
		modulusLength?: number;
		hash?: { name: string };
	};
	if (key.type === 'secret') {
		throw new PublishError(
			'KEY',
			`a shared secret (${describeAlgorithm(algorithm)}) cannot sign rules: use an asymmetric private key (${ALGS.join(', ')})`,
		);
	}
	const found = describeAlgorithm(algorithm);
	const hash = algorithm.hash?.name;
	const fits: Record<Alg, boolean> = {
		ES256: algorithm.name === 'ECDSA' && algorithm.namedCurve === 'P-256',
		EdDSA: algorithm.name === 'Ed25519',
		RS256:
			algorithm.name === 'RSASSA-PKCS1-v1_5' &&
			(algorithm.modulusLength ?? 0) >= 2048 &&
			(hash === undefined || hash === 'SHA-256'),
		PS256:
			algorithm.name === 'RSA-PSS' &&
			(algorithm.modulusLength ?? 0) >= 2048 &&
			(hash === undefined || hash === 'SHA-256'),
	};
	if (!fits[alg]) throw mismatch(alg, found);
}

/** Refuses a key that is not a private `CryptoKey` of the kind `alg` needs. */
export function assertSigningKey(key: unknown, alg: Alg): CryptoKey {
	if (!isCryptoKey(key)) {
		throw new PublishError(
			'KEY',
			'`key` must be a CryptoKey (import a PKCS#8 PEM with importPKCS8, or generate a pair)',
		);
	}
	checkCryptoKey(key, alg);
	if (key.type !== 'private') {
		throw new PublishError(
			'KEY',
			'signing needs the private key, not the public',
		);
	}
	if (!key.usages.includes('sign')) {
		throw new PublishError(
			'KEY',
			'the key cannot sign (its usages lack "sign")',
		);
	}
	return key;
}

function base64urlBytes(value: unknown): number {
	if (typeof value !== 'string') return 0;
	const padding = value.length % 4 === 0 ? 0 : 4 - (value.length % 4);
	return ((value.length + padding) / 4) * 3 - padding;
}

export function checkJwk(jwk: JWK, alg: Alg): void {
	if (jwk.kty === 'oct') {
		throw new PublishError(
			'KEY',
			'an oct key is a shared secret and cannot go in a key set: use an asymmetric key',
		);
	}
	const found = `a ${jwk.kty ?? 'unknown'} JWK${jwk.crv ? ` (${jwk.crv})` : ''}`;
	const fits: Record<Alg, boolean> = {
		ES256: jwk.kty === 'EC' && jwk.crv === 'P-256',
		EdDSA: jwk.kty === 'OKP' && jwk.crv === 'Ed25519',
		RS256: jwk.kty === 'RSA' && base64urlBytes(jwk.n) >= 256,
		PS256: jwk.kty === 'RSA' && base64urlBytes(jwk.n) >= 256,
	};
	if (!fits[alg]) throw mismatch(alg, found);
}
