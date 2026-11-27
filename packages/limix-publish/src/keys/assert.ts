import { ALGORITHMS } from '@softistx/limix/remote';
import { PublishError } from '../errors';

/** The signature algorithms a rules token may use: asymmetric only (core's list). */
export { ALGORITHMS };

/** One of the four asymmetric algorithms `@softistx/limix/remote` accepts. */
export type Alg = (typeof ALGORITHMS)[number];

/** Refuses an algorithm that is not one of the four, with the allowed list. */
export function assertAlg(alg: unknown): asserts alg is Alg {
	if (!ALGORITHMS.includes(alg as Alg)) {
		throw new PublishError(
			'OPTIONS',
			`alg ${JSON.stringify(alg)} is not allowed: use ${ALGORITHMS.join(', ')} (asymmetric only; a shared secret cannot tell a publisher from a reader)`,
		);
	}
}

/** Refuses an empty or non-string `kid`. */
export function assertKid(kid: unknown): asserts kid is string {
	if (typeof kid !== 'string' || kid.trim() === '') {
		throw new PublishError('OPTIONS', '`kid` must be a non-empty string');
	}
}

const PKCS1 = /-----BEGIN (RSA|EC) PRIVATE KEY-----/;

/**
 * Refuses a PEM that is a PKCS#1 or SEC1 key (`BEGIN RSA/EC PRIVATE KEY`),
 * with the `openssl` command that converts it to PKCS#8.
 */
export function assertPkcs8(pem: string): void {
	if (PKCS1.test(pem)) {
		throw new PublishError(
			'KEY',
			'the PEM is a PKCS#1 or SEC1 key (BEGIN RSA/EC PRIVATE KEY): convert it with `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.p8.pem`',
		);
	}
}
