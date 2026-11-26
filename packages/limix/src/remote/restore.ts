import { DEFAULT_TYP } from './defaults';
import type { RemotePolicyError } from './errors';
import type { Holder } from './holder';
import { loadStored } from './stored';
import type { RemotePolicyLogger, RemotePolicyOptions } from './types';

export interface RestoreDeps {
	holder: Holder;
	logger: RemotePolicyLogger;
	now: () => number;
	fail: (error: RemotePolicyError) => void;
	stopped: AbortSignal;
	maxStaleMs: number;
	timeoutMs: number;
}

/** Holds the stored copy as provisional, unless there is none or the policy was stopped. */
export async function restoreFromStore(
	options: RemotePolicyOptions,
	deps: RestoreDeps,
): Promise<void> {
	if (!options.store) return;
	const found = await loadStored(options.store, {
		typ: options.typ ?? DEFAULT_TYP,
		...(options.conditions ? { conditions: options.conditions } : {}),
		audience: options.audience,
		maxStaleMs: deps.maxStaleMs,
		timeoutMs: deps.timeoutMs,
		now: deps.now,
		logger: deps.logger,
		fail: deps.fail,
		...(options.issuer ? { issuer: options.issuer } : {}),
		...(options.trustedKeys ? { trustedKeys: options.trustedKeys } : {}),
	});
	// A `stop()` during the read: nothing is held, whatever the store said.
	if (!found || deps.stopped.aborted) return;
	const { verified, jws, etag, verifiedAt } = found;
	deps.holder.hold(verified, {
		jws,
		verifiedAt,
		provisional: true,
		...(etag ? { etag } : {}),
	});
}
