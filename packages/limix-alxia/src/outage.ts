import { isPolicySource } from '@softistx/limix';
import type { LimixAlxiaOptions } from './options';

/** One outage, as REST and GraphQL both see it. */
export interface Outage {
	/** The REST guard's reading: `fit` is the policy it judges by, or `null` for none; `current` what the source holds. */
	rest(fit: unknown | null, current: unknown | null): void;
	/** limix-graxia's `onUnavailable`: the GraphQL side saw the policy unusable. */
	graphql(): void;
}

const outages = new WeakMap<object, Outage>();

/**
 * The outage state of one `limix` options object, shared by the REST guard
 * and the GraphQL field guard it feeds: `onUnavailable` runs once per outage
 * whichever side sees it first, and again after a fitting policy came back
 * (seen by the REST side, or told apart by the policy the source holds).
 */
export function outageOf(options: LimixAlxiaOptions<never>): Outage {
	const known = outages.get(options);
	if (known) return known;
	const notify = () => options.onUnavailable?.();
	let down = false;
	let at: unknown;
	const outage: Outage = {
		rest(fit, current) {
			if (fit) {
				down = false;
				return;
			}
			if (down) return;
			down = true;
			at = current;
			notify();
		},
		graphql() {
			const { policy } = options;
			const current = isPolicySource(policy) ? policy.current() : policy;
			if (down && at === current) return;
			down = true;
			at = current;
			notify();
		},
	};
	outages.set(options, outage);
	return outage;
}
