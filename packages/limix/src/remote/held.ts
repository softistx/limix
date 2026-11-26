import type { CompiledPolicy } from '../rules';
import { RemotePolicyError } from './errors';
import type { RemotePolicyLogger } from './types';
import type { Verified } from './verify';

export interface Held {
	verified: Verified;
	jws: string;
	verifiedAt: number;
	etag?: string;
	/**
	 * Restored from the store and not yet verified with the live keys. It
	 * serves, but sets no `ver` floor and is replaced by the first live token.
	 */
	provisional: boolean;
}

export interface HoldMeta {
	jws: string;
	etag?: string;
	provisional?: boolean;
	verifiedAt?: number;
}

export interface HoldResult {
	changed: boolean;
	store: boolean;
}

export type Listener = (policy: CompiledPolicy | null) => void;

export interface HolderOptions {
	now: () => number;
	logger: RemotePolicyLogger;
	/** How far past `exp` a held copy still serves; beyond it, it is withdrawn. */
	maxStaleMs: number;
	onChange?: (info: { ver: number; previousVer: number | null }) => void;
	/** Called when a held copy is withdrawn for being too far past its `exp`. */
	onExpired?: (error: RemotePolicyError) => void;
}

/**
 * An equal `ver` keeps the held rules. A token with identical rules (a
 * re-signing) replaces the held token and its `exp`; other rules under the
 * same `ver` are refused as `CLAIMS`, since the publisher must bump `ver`.
 */
export function refreshEqual(
	previous: Held,
	verified: Verified,
	meta: HoldMeta,
	now: number,
): HoldResult {
	if (previous.verified.fingerprint !== verified.fingerprint) {
		throw new RemotePolicyError(
			'CLAIMS',
			`ver ${verified.ver} is already held with different rules: the publisher must bump ver`,
		);
	}
	const resigned = previous.jws !== meta.jws;
	if (resigned) {
		previous.jws = meta.jws;
		previous.verified = { ...verified, policy: previous.verified.policy };
	}
	if (meta.etag) previous.etag = meta.etag;
	else delete previous.etag;
	previous.verifiedAt = now;
	return { changed: false, store: resigned };
}

/** The highest live-verified `ver` and the fingerprint of the rules that set it. */
export interface Floor {
	ver: number;
	fingerprint: string | null;
}

export function raiseFloor(floor: Floor, verified: Verified) {
	if (verified.ver < floor.ver) return;
	floor.ver = verified.ver;
	floor.fingerprint = verified.fingerprint;
}

/** After a withdrawal, a token at the floor's `ver` must carry the floor's rules. */
export function assertFloorRules(floor: Floor, verified: Verified) {
	if (
		floor.ver > 0 &&
		verified.ver === floor.ver &&
		verified.fingerprint !== floor.fingerprint
	) {
		throw new RemotePolicyError(
			'CLAIMS',
			`ver ${verified.ver} was held with different rules before its withdrawal: the publisher must bump ver`,
		);
	}
}

export function newHeld(verified: Verified, meta: HoldMeta, now: number): Held {
	return {
		verified,
		jws: meta.jws,
		verifiedAt: meta.verifiedAt ?? now,
		provisional: meta.provisional === true,
		...(meta.etag ? { etag: meta.etag } : {}),
	};
}

/** Seconds past `exp` of a held copy beyond `maxStaleMs`, or null while it still serves. */
export function pastBound(held: Held, options: HolderOptions): number | null {
	const exp = held.verified.exp ?? held.verified.iat;
	const past = options.now() - exp * 1000;
	return past > options.maxStaleMs ? Math.round(past / 1000) : null;
}
