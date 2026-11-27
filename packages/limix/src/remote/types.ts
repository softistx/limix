import type { JSONWebKeySet } from 'jose';
import type { Condition } from '../rules';
import type { PolicySource } from '../source';
import type { RemotePolicyError } from './errors';

export type RemotePolicyErrorCode =
	| 'FETCH_FAILED'
	| 'HTTP_STATUS'
	| 'SIGNATURE'
	| 'CLAIMS'
	| 'STALE_VERSION'
	| 'RULES_REFUSED'
	| 'STORE'
	| 'EXPIRED'
	| 'TOO_LARGE';

/** A signed policy and the key set that verified it, as kept by a `PolicyStore`. */
export interface StoredPolicy {
	jws: string;
	jwks: JSONWebKeySet;
	etag?: string;
}

/** Where the last accepted policy survives a restart. Opt-in. */
export interface PolicyStore {
	read(): Promise<StoredPolicy | null>;
	write(value: StoredPolicy): Promise<void>;
}

/**
 * Where `remotePolicy()` writes its logs. Any logger with these three methods
 * fits (winston, pino, `console`); the default logs nothing.
 */
export interface RemotePolicyLogger {
	info(message: string, data?: Record<string, unknown>): void;
	warn(message: string, data?: Record<string, unknown>): void;
	error(message: string, data?: Record<string, unknown>): void;
}

export interface RemotePolicyOptions {
	/** Where the signed rules (a compact JWS) are pulled from. */
	rulesUrl: string;
	/** Required `aud` of the token. */
	audience: string;
	/** Required `typ` header of the token; default `limix-rules+jwt`. */
	typ?: string;
	/**
	 * The predicates the pulled rules' `when` may name. A document naming one
	 * that is not here is refused (`RULES_REFUSED`): a remote file carries no code.
	 */
	conditions?: Readonly<Record<string, Condition>>;
	/** The key set's URL. Give this, `issuer`, or both. */
	jwksUri?: string;
	/**
	 * Required `iss` whenever given. Without `jwksUri`, `jwks_uri` is
	 * discovered from the issuer's OpenID configuration, which must name the
	 * same issuer.
	 */
	issuer?: string;
	/**
	 * JWK thumbprints (RFC 7638) allowed in a stored key set. When set, a
	 * stored copy holding any other key is ignored (`STORE`). The store must
	 * be trusted like the code; this pins which keys it may vouch for.
	 */
	trustedKeys?: string[];
	/**
	 * Aborts a pull, a discovery or a key fetch that takes longer, and bounds a
	 * `store.read()` at start. Finite, above 0; default 10_000.
	 */
	timeoutMs?: number;
	/**
	 * How long past its `exp` a copy is still served. A stored copy beyond it
	 * is refused at start (`STORE`); a held one beyond it is withdrawn
	 * (`EXPIRED`). A number above 0; default 86_400_000; `Infinity` never
	 * refuses.
	 */
	maxStaleMs?: number;
	/** Sent as `Authorization: Bearer`; a function is called on every pull. */
	authToken?: string | (() => string | Promise<string>);
	/** Poll period. Finite, above 0; default 60_000. */
	intervalMs?: number;
	store?: PolicyStore;
	logger?: RemotePolicyLogger;
	/** Called after the subscribers, when the held rules changed. */
	onChange?: (info: { ver: number; previousVer: number | null }) => void;
	/** Called on every failed pull; the last known good rules keep serving. */
	onError?: (error: RemotePolicyError) => void;
	fetch?: typeof fetch;
	/** Milliseconds since the epoch. */
	now?: () => number;
}

export interface RemotePolicy extends PolicySource {
	/** Resolves once a policy is held (store or network); never rejects. */
	readonly ready: Promise<void>;
	/**
	 * Forces a pull. `changed` is true when the held rules changed; `error` is
	 * set when the pull failed (the last good copy keeps serving). Never throws.
	 */
	refresh(): Promise<{ changed: boolean; error?: RemotePolicyError }>;
	/** Clears the timer. */
	stop(): void;
	/** Milliseconds since the held copy was verified or confirmed by a 304. */
	age(): number | null;
	version(): number | null;
}
