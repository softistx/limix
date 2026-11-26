import type { RemotePolicyLogger } from './types';

/** The defaults of `remotePolicy()`'s numeric options, in one place. */
export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_STALE_MS = 86_400_000;
export const DEFAULT_INTERVAL_MS = 60_000;

/** The `typ` header a rules token carries unless `typ` says otherwise. */
export const DEFAULT_TYP = 'limix-rules+jwt';

/** The largest body read from the publisher or the issuer, in bytes. */
export const MAX_BODY_BYTES = 1_048_576;

/** The default logger: nothing is logged. */
export const NOOP_LOGGER: RemotePolicyLogger = {
	info() {},
	warn() {},
	error() {},
};
