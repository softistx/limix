import { policySource } from '../source';
import { type CycleContext, pullOnce } from './cycle';
import {
	DEFAULT_INTERVAL_MS,
	DEFAULT_MAX_STALE_MS,
	DEFAULT_TIMEOUT_MS,
	DEFAULT_TYP,
	NOOP_LOGGER,
} from './defaults';
import { createHolder } from './holder';
import { createKeys } from './keys';
import { createReporter } from './reporter';
import { restoreFromStore } from './restore';
import type {
	RemotePolicy,
	RemotePolicyLogger,
	RemotePolicyOptions,
} from './types';
import { assertOptions } from './validate';

interface ContextDeps {
	fetchImpl: typeof fetch;
	now: () => number;
	holder: ReturnType<typeof createHolder>;
	fail: CycleContext['fail'];
	logger: RemotePolicyLogger;
	timeoutMs: number;
	signal: AbortSignal;
	restored: Promise<void>;
}

/** What one pull needs, from the options and the parts built around them. */
function cycleContext(
	options: RemotePolicyOptions,
	deps: ContextDeps,
): CycleContext {
	const issuer = options.issuer ? { issuer: options.issuer } : {};
	return {
		url: options.rulesUrl,
		typ: options.typ ?? DEFAULT_TYP,
		audience: options.audience,
		timeoutMs: deps.timeoutMs,
		fetch: deps.fetchImpl,
		now: deps.now,
		holder: deps.holder,
		fail: deps.fail,
		logger: deps.logger,
		signal: deps.signal,
		// A pull waits for the store: a stored copy never replaces a newer pull.
		restored: deps.restored,
		keys: createKeys({
			fetch: deps.fetchImpl,
			timeoutMs: deps.timeoutMs,
			...(options.jwksUri ? { jwksUri: options.jwksUri } : {}),
			...issuer,
		}),
		...issuer,
		...(options.authToken !== undefined ? { token: options.authToken } : {}),
		...(options.conditions ? { conditions: options.conditions } : {}),
		...(options.store ? { store: options.store } : {}),
		...(options.trustedKeys ? { trustedKeys: options.trustedKeys } : {}),
	};
}

/**
 * A `PolicySource` that pulls rules signed as a compact JWS, verifies them
 * against the publisher's keys and holds the last good copy. A failed pull
 * keeps that copy serving and is reported through `onError`; the copy stops
 * serving (and `subscribe` listeners hear `null`) once it is past its expiry
 * by `maxStaleMs`, or when the live keys refuse it.
 */
export function remotePolicy(options: RemotePolicyOptions): RemotePolicy {
	assertOptions(options);
	const fetchImpl = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const logger = options.logger ?? NOOP_LOGGER;
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxStaleMs = options.maxStaleMs ?? DEFAULT_MAX_STALE_MS;
	const fail = createReporter(options, logger);
	const holder = createHolder({
		now,
		logger,
		maxStaleMs,
		onExpired: fail,
		...(options.onChange ? { onChange: options.onChange } : {}),
	});
	const stopper = new AbortController();
	const restored = restoreFromStore(options, {
		holder,
		logger,
		now,
		fail,
		stopped: stopper.signal,
		maxStaleMs,
		timeoutMs,
	});
	const context = cycleContext(options, {
		fetchImpl,
		now,
		holder,
		fail,
		logger,
		timeoutMs,
		signal: stopper.signal,
		restored,
	});

	let inFlight: Promise<boolean> | undefined;
	const refresh = (): Promise<boolean> => {
		inFlight ??= pullOnce(context).finally(() => {
			inFlight = undefined;
		});
		return inFlight;
	};
	void refresh();
	const timer = setInterval(
		() => void refresh(),
		options.intervalMs ?? DEFAULT_INTERVAL_MS,
	);
	// Node and Bun let a process exit past the timer; a browser has no `unref`.
	(timer as { unref?: () => void }).unref?.();

	const source = policySource({
		current: () => {
			holder.expire();
			return holder.get()?.verified.policy ?? null;
		},
		subscribe: holder.subscribe,
	});
	return Object.assign(source, {
		ready: holder.ready,
		refresh,
		stop: () => {
			clearInterval(timer);
			stopper.abort();
		},
		age: () => {
			const held = holder.get();
			return held ? Math.max(0, now() - held.verifiedAt) : null;
		},
		version: () => holder.get()?.verified.ver ?? null,
	});
}
