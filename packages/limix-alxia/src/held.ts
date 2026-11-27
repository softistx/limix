import {
	type CompiledPolicy,
	isPolicySource,
	LimixRefusal,
	outageReporter,
} from '@softistx/limix';
import type { LimixAlxiaOptions, RoutesOf } from './options';
import { policyProblems } from './setup-check';

/** What the guard holds: the policy to judge by now, or the refusal that answers instead. */
export interface Held {
	snapshot(): CompiledPolicy | LimixRefusal;
}

const unavailable = (reason: 'no-policy' | 'policy-mismatch') =>
	new LimixRefusal('limix.errors.unavailable', 503, { reason });

/**
 * The policy held now, one read per call, fail closed: a source holding none
 * answers 503 `no-policy`, and a policy that does not fit the app's routes
 * (checked once per policy, on the first request, when every route is declared)
 * answers 503 `policy-mismatch`. `onUnavailable` runs once per outage and is
 * re-armed when a fitting policy is back.
 */
export function makeHeld(
	options: LimixAlxiaOptions<never>,
	before: RoutesOf,
): Held {
	const { policy } = options;
	const report = outageReporter(options.onUnavailable ?? (() => {}));
	const checked = new WeakMap<CompiledPolicy, boolean>();
	const fits = (held: CompiledPolicy): boolean => {
		let ok = checked.get(held);
		if (ok === undefined) {
			const problems = policyProblems(held, options.app, before);
			ok = problems.length === 0;
			checked.set(held, ok);
			if (!ok) {
				console.error(
					`limix-alxia: the policy does not fit the app, every request is refused with 503:\n- ${problems.join('\n- ')}`,
				);
			}
		}
		return ok;
	};
	return {
		snapshot() {
			const held = isPolicySource(policy) ? policy.current() : policy;
			if (held === null) {
				report(null);
				return unavailable('no-policy');
			}
			const ok = fits(held);
			report(ok ? held : null);
			return ok ? held : unavailable('policy-mismatch');
		},
	};
}
