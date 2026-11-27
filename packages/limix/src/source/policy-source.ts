import type { CompiledPolicy } from '../rules';

/**
 * The registered brand of a source, so a second copy of this package still
 * recognises it. Not exported: the contract between copies is the registry key
 * `Symbol.for('limix.policy-source')`, which `isPolicySource` reads. Build a
 * source with `policySource`, which checks the implementation, never by
 * setting the brand by hand.
 */
export const POLICY_SOURCE: unique symbol = Symbol.for('limix.policy-source');

/**
 * Where an evaluator gets its compiled policy from, now and when it changes.
 * `current()` is `null` until the source holds a policy: an evaluator then
 * refuses every request with `limix.errors.unavailable`.
 */
export interface PolicySource {
	readonly [POLICY_SOURCE]: true;
	current(): CompiledPolicy | null;
	/** `listener` fires with each new policy, and with `null` on withdrawal. Returns the unsubscribe. */
	subscribe(listener: (policy: CompiledPolicy | null) => void): () => void;
}

/** Brands an implementation as a source; a method that is not a function throws here, not at the first request. */
export function policySource(
	impl: Pick<PolicySource, 'current' | 'subscribe'>,
): PolicySource {
	if (
		typeof impl?.current !== 'function' ||
		typeof impl?.subscribe !== 'function'
	) {
		throw new TypeError(
			'policySource: `current` and `subscribe` must both be functions',
		);
	}
	return {
		current: () => impl.current(),
		subscribe: (listener) => impl.subscribe(listener),
		[POLICY_SOURCE]: true,
	};
}

export function isPolicySource(value: unknown): value is PolicySource {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Record<symbol, unknown>)[POLICY_SOURCE] === true &&
		typeof (value as PolicySource).current === 'function' &&
		typeof (value as PolicySource).subscribe === 'function'
	);
}

/** A source over a fixed policy: `subscribe` never fires. */
export function staticSource(policy: CompiledPolicy): PolicySource {
	return policySource({ current: () => policy, subscribe: () => () => {} });
}

/** A source whose policy is swapped by hand; `swap(null)` withdraws it. */
export interface MutableSource extends PolicySource {
	swap(next: CompiledPolicy | null): void;
}

export function mutableSource(initial?: CompiledPolicy): MutableSource {
	let policy: CompiledPolicy | null = initial ?? null;
	const listeners = new Set<(policy: CompiledPolicy | null) => void>();
	const source = policySource({
		current: () => policy,
		subscribe: (listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	});
	return {
		...source,
		swap(next) {
			policy = next;
			for (const listener of listeners) listener(policy);
		},
	};
}
