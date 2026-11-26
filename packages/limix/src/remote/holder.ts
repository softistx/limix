import type { CompiledPolicy } from '../rules';
import { RemotePolicyError } from './errors';
import {
	assertFloorRules,
	type Floor,
	type Held,
	type HolderOptions,
	type HoldMeta,
	type HoldResult,
	type Listener,
	newHeld,
	pastBound,
	raiseFloor,
	refreshEqual,
} from './held';
import type { RemotePolicyLogger } from './types';
import type { Verified } from './verify';

export type Holder = ReturnType<typeof createHolder>;

function tell(
	listeners: Set<Listener>,
	policy: CompiledPolicy | null,
	logger: RemotePolicyLogger,
) {
	for (const listener of [...listeners]) {
		try {
			listener(policy);
		} catch (error) {
			logger.error('remotePolicy: a subscriber threw', {
				error: String(error),
			});
		}
	}
}

function announce(
	listeners: Set<Listener>,
	options: HolderOptions,
	verified: Verified,
	previousVer: number | null,
) {
	const { logger } = options;
	logger.info('remotePolicy: policy accepted', {
		ver: verified.ver,
		...(verified.schema ? { schema: verified.schema } : {}),
	});
	tell(listeners, verified.policy, logger);
	try {
		options.onChange?.({ ver: verified.ver, previousVer });
	} catch (error) {
		logger.error('remotePolicy: onChange threw', { error: String(error) });
	}
}

/** What the holder keeps between calls. */
interface State {
	held: Held | null;
	listeners: Set<Listener>;
	// The highest `ver` a live-verified token has had, with its rules. It
	// survives a withdrawal, so an older token cannot roll the rules back; a
	// refused copy never sets it.
	floor: Floor;
}

function withdraw(state: State, options: HolderOptions) {
	if (!state.held) return;
	state.held = null;
	tell(state.listeners, null, options.logger);
}

/** `Holder.hold`: see there. */
function holdIn(
	state: State,
	options: HolderOptions,
	verified: Verified,
	meta: HoldMeta,
): HoldResult {
	const previous = state.held;
	const previousVer = previous?.verified.ver ?? null;
	if (previous && !previous.provisional && previousVer === verified.ver) {
		return refreshEqual(previous, verified, meta, options.now());
	}
	if (!previous && meta.provisional !== true) {
		assertFloorRules(state.floor, verified);
	}
	const next = newHeld(verified, meta, options.now());
	state.held = next;
	if (!next.provisional) raiseFloor(state.floor, verified);
	if (previous?.provisional && previous.jws === meta.jws) {
		return { changed: false, store: true };
	}
	announce(state.listeners, options, verified, previousVer);
	return { changed: true, store: true };
}

/** `Holder.expire`: see there. */
function expireIn(state: State, options: HolderOptions): boolean {
	const past = state.held ? pastBound(state.held, options) : null;
	if (past === null) return false;
	withdraw(state, options);
	options.onExpired?.(
		new RemotePolicyError(
			'EXPIRED',
			`the held policy is ${past}s past its expiry, beyond maxStaleMs: withdrawn`,
		),
	);
	return true;
}

/** The held policy, its subscribers and the `ready` latch. */
export function createHolder(options: HolderOptions) {
	const state: State = {
		held: null,
		listeners: new Set<Listener>(),
		floor: { ver: 0, fingerprint: null },
	};
	let markReady!: () => void;
	const ready = new Promise<void>((resolve) => {
		markReady = resolve;
	});
	return {
		ready,
		get: () => state.held,
		/**
		 * Holds `verified`. `changed` is true when the served rules changed;
		 * `store` when the copy to keep on disk changed. A live token replaces a
		 * provisional copy whatever its `ver`. An equal `ver` is `refreshEqual`.
		 */
		hold(verified: Verified, meta: HoldMeta): HoldResult {
			const result = holdIn(state, options, verified, meta);
			markReady();
			return result;
		},
		/**
		 * The provisional copy verified against the live keys: it now sets the
		 * floor. Its stored ETag is forgotten, so the next pull is unconditional.
		 */
		promote() {
			if (!state.held) return;
			state.held.provisional = false;
			raiseFloor(state.floor, state.held.verified);
			delete state.held.etag;
		},
		/** Withdraws a provisional copy that the live keys refuse; subscribers hear `null`. */
		drop: () => withdraw(state, options),
		/** Withdraws the held copy once it is past `exp + maxStaleMs`; true when it did. */
		expire: () => expireIn(state, options),
		/** The `ver` below which a pulled token is refused as a rollback. */
		floor: () => state.floor.ver,
		confirm() {
			if (state.held) state.held.verifiedAt = options.now();
		},
		subscribe(listener: Listener) {
			state.listeners.add(listener);
			return () => {
				state.listeners.delete(listener);
			};
		},
	};
}
