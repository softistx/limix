import { calculateJwkThumbprint, createLocalJWKSet } from 'jose';
import type { Condition } from '../rules';
import { messageOf, within } from './deadline';
import { RemotePolicyError } from './errors';
import type { PolicyStore, RemotePolicyLogger, StoredPolicy } from './types';
import { type Verified, verifyPolicyToken } from './verify';

export interface LoadOptions {
	typ: string;
	conditions?: Readonly<Record<string, Condition>>;
	audience: string;
	issuer?: string;
	trustedKeys?: string[];
	maxStaleMs: number;
	/** Bounds `store.read()`: a hung store is reported as `STORE`. */
	timeoutMs: number;
	now: () => number;
	logger: RemotePolicyLogger;
	fail: (error: RemotePolicyError) => void;
}

export interface Restored {
	verified: Verified;
	jws: string;
	etag?: string;
	/** From the token's `iat`, so `age()` tells how old the copy really is. */
	verifiedAt: number;
}

/** Clock skew allowed between the publisher and this machine. */
const FUTURE_TOLERANCE_MS = 60_000;

const storeError = (message: string, cause?: unknown) =>
	new RemotePolicyError('STORE', message, { cause });

async function checkTrustedKeys(stored: StoredPolicy, trusted: string[]) {
	const allowed = new Set(trusted);
	for (const key of stored.jwks.keys) {
		if (!allowed.has(await calculateJwkThumbprint(key))) {
			throw storeError(
				'the stored key set holds a key that is not in trustedKeys',
			);
		}
	}
}

/** Warns when the live key set holds a key `trustedKeys` does not list: a restart would refuse the copy it is saved with. */
export async function warnUntrustedKeys(
	jwks: StoredPolicy['jwks'],
	trusted: string[],
	logger: RemotePolicyLogger,
) {
	const allowed = new Set(trusted);
	for (const key of jwks.keys) {
		const thumbprint = await calculateJwkThumbprint(key);
		if (allowed.has(thumbprint)) continue;
		logger.warn(
			'remotePolicy: the live key set holds a key that is not in trustedKeys; a restart will ignore the stored copy',
			{ thumbprint },
		);
	}
}

/**
 * Reads the store and verifies the saved token offline against the saved key
 * set. The store vouches for itself, so the copy is only provisional: the
 * caller replaces it with the first live token. An expired copy is served as
 * last known good with a warning, up to `maxStaleMs` past its expiry; beyond
 * that, and for any other fault, it is reported as `STORE` and ignored.
 */
export async function loadStored(
	store: PolicyStore,
	options: LoadOptions,
): Promise<Restored | null> {
	try {
		const stored = await within(store.read(), options.timeoutMs);
		if (!stored) return null;
		if (options.trustedKeys)
			await checkTrustedKeys(stored, options.trustedKeys);
		const now = options.now();
		const verified = await verifyPolicyToken(
			stored.jws,
			createLocalJWKSet(stored.jwks),
			{
				typ: options.typ,
				...(options.conditions ? { conditions: options.conditions } : {}),
				audience: options.audience,
				now,
				ignoreExpiry: true,
				...(options.issuer ? { issuer: options.issuer } : {}),
			},
		);
		if (verified.iat * 1000 > now + FUTURE_TOLERANCE_MS) {
			throw storeError('the stored policy was issued in the future');
		}
		const pastMs = now - (verified.exp ?? verified.iat) * 1000;
		if (pastMs > options.maxStaleMs) {
			throw storeError(
				`the stored policy is ${Math.round(pastMs / 1000)}s past its expiry, beyond maxStaleMs`,
			);
		}
		if (verified.expired) {
			options.logger.warn(
				'remotePolicy: the stored policy is expired; serving it until a pull succeeds',
				{ ver: verified.ver },
			);
		}
		return {
			verified,
			jws: stored.jws,
			verifiedAt: verified.iat * 1000,
			...(stored.etag ? { etag: stored.etag } : {}),
		};
	} catch (error) {
		options.fail(
			error instanceof RemotePolicyError && error.code === 'STORE'
				? error
				: storeError(
						`the stored policy was not used: ${messageOf(error)}`,
						error,
					),
		);
		return null;
	}
}

/** Writes an accepted policy; a failure or a write that outlives `timeoutMs` is reported as `STORE` and never thrown. */
export async function saveStored(
	store: PolicyStore,
	value: StoredPolicy,
	fail: (error: RemotePolicyError) => void,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<void> {
	try {
		await within(store.write(value), timeoutMs, signal);
	} catch (error) {
		// `signal` is `stop()`'s: stopping is not a store fault.
		if (signal?.aborted) return;
		fail(
			storeError(
				`could not write the policy store: ${messageOf(error)}`,
				error,
			),
		);
	}
}
