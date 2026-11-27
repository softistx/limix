import { isPolicySource, type PolicySource } from '@softistx/limix';
import type { LimixAlxiaOptions } from './options';

/** One outage, as REST and GraphQL both see it. */
export interface Outage {
	/** The REST guard's reading: `fit` is the policy it judges by, or `null` for none; `current` what the source holds. */
	rest(fit: unknown | null, current: unknown | null): void;
	/** limix-graxia's `onUnavailable`: the GraphQL side saw the policy unusable. */
	graphql(): void;
	/** The policy as limix-graxia should read it: a source that tells this state which policy is held, so a recovery seen by GraphQL alone ends the outage. */
	watch<P extends object>(policy: P): P;
}

const outages = new WeakMap<object, Outage>();

/**
 * The outage state of one `limix` options object, shared by the REST guard
 * and the GraphQL field guard it feeds. It remembers the outage last reported
 * (by the policy the source held then): a report of the same outage from the
 * other side is dropped, and a different policy held, or a fitting one seen by
 * REST, ends it, so the next outage is reported whichever side sees it.
 */
export function outageOf(options: LimixAlxiaOptions<never>): Outage {
	const known = outages.get(options);
	if (known) return known;
	let reported: { at: unknown } | undefined;
	const note = (at: unknown) => {
		if (reported && reported.at === at) return;
		reported = { at };
		options.onUnavailable?.();
	};
	const outage: Outage = {
		rest(fit, current) {
			if (fit) reported = undefined;
			else note(current);
		},
		graphql() {
			const { policy } = options;
			note(isPolicySource(policy) ? policy.current() : policy);
		},
		watch(policy) {
			if (!isPolicySource(policy)) return policy;
			const source: PolicySource = policy;
			return Object.create(source, {
				current: {
					value() {
						const held = source.current();
						// limix-graxia reports an outage once, by its own state, which a
						// recovery only the REST guard saw never re-arms: report the
						// withdrawal here, where every read of the source passes.
						if (held === null) note(null);
						else if (reported && held !== reported.at) reported = undefined;
						return held;
					},
				},
			});
		},
	};
	outages.set(options, outage);
	return outage;
}
