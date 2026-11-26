import { PublishError } from '../errors';
import { generatePair, importPem } from '../jose';
import { type Alg, assertAlg, assertPkcs8 } from './assert';

/**
 * Imports a PKCS#8 private key PEM (`-----BEGIN PRIVATE KEY-----`) as the
 * `CryptoKey` `signRules` takes. Refuses an `alg` that is not one of the four,
 * and a PKCS#1 or SEC1 PEM with the `openssl` command that converts it.
 */
export async function importSigningKey(
	pem: string,
	alg: Alg,
): Promise<CryptoKey> {
	assertAlg(alg);
	assertPkcs8(pem);
	try {
		return await importPem(pem, alg);
	} catch (error) {
		throw new PublishError(
			'KEY',
			`could not import the PKCS#8 key as ${alg}: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}

/**
 * A new key pair for `alg`, for tests and first setups: the private key cannot
 * be exported (keep a PEM from `openssl` for production), the public key can.
 */
export async function generateSigningKeyPair(alg: Alg): Promise<CryptoKeyPair> {
	assertAlg(alg);
	return generatePair(alg);
}
