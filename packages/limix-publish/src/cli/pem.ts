import { createPrivateKey, createPublicKey, type KeyObject } from 'node:crypto';
import { ALGORITHMS, type Alg, importSigningKey, PublishError } from '../index';
import { assertPkcs8 } from '../keys';
import { UsageError } from './io';

/**
 * The algorithm a key implies: EC P-256 ES256, Ed25519 EdDSA, RSA-PSS PS256.
 * A plain RSA key fits RS256 and PS256, so it must be told.
 */
export function inferAlg(key: KeyObject): Alg {
	const type = key.asymmetricKeyType;
	if (type === 'ec') {
		const curve = key.asymmetricKeyDetails?.namedCurve;
		if (curve === 'prime256v1' || curve === 'P-256') return 'ES256';
		throw new PublishError(
			'KEY',
			`an EC key on ${curve ?? 'an unknown curve'} cannot sign rules: only P-256 (ES256)`,
		);
	}
	if (type === 'ed25519') return 'EdDSA';
	if (type === 'rsa-pss') return 'PS256';
	if (type === 'rsa') {
		throw new UsageError(
			'an RSA key fits both RS256 and PS256: pass --alg RS256 or --alg PS256',
		);
	}
	throw new PublishError(
		'KEY',
		`a ${type ?? 'unknown'} key cannot sign rules: use EC P-256, Ed25519 or RSA`,
	);
}

/** Reads a PEM with node:crypto, turning its failure into a `PublishError`. */
function readPem<T>(read: () => T, what: string): T {
	try {
		return read();
	} catch (error) {
		throw new PublishError(
			'KEY',
			`could not read ${what} as a PEM: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

/** Refuses an `--alg` that is not one of the four. */
export function checkAlg(alg: string | undefined): Alg | undefined {
	if (alg !== undefined && !ALGORITHMS.includes(alg as Alg)) {
		throw new PublishError(
			'OPTIONS',
			`alg "${alg}" is not allowed: use ${ALGORITHMS.join(', ')}`,
		);
	}
	return alg as Alg | undefined;
}

/** The private key of a PKCS#8 PEM, with the algorithm to sign with. */
export async function privateKeyOf(
	pem: string,
	alg: string | undefined,
): Promise<{ key: CryptoKey; alg: Alg }> {
	const given = checkAlg(alg);
	// node:crypto cannot tell what a PKCS#1 or SEC1 PEM is for: say how to convert it.
	assertPkcs8(pem);
	const chosen =
		given ?? inferAlg(readPem(() => createPrivateKey(pem), 'the key'));
	return { key: await importSigningKey(pem, chosen), alg: chosen };
}

/** The public JWK of an SPKI or PKCS#8 PEM, with the algorithm to use. */
export function publicJwkOf(
	pem: string,
	alg: string | undefined,
): { jwk: object; alg: Alg } {
	const given = checkAlg(alg);
	const object = readPem(() => createPublicKey(pem), 'the key');
	return {
		jwk: object.export({ format: 'jwk' }),
		alg: given ?? inferAlg(object),
	};
}
