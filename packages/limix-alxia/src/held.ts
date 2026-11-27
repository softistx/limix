import {
	type CompiledPolicy,
	isPolicySource,
	LimixRefusal,
} from '@softistx/limix';
import { unguardedRoutes } from './endpoints';
import type { LimixAlxiaOptions } from './options';
import { outageOf } from './outage';
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
 * or has a route that does not run the guard answers 503 `policy-mismatch`, and `onMismatch` (else `console.error`) hears
 * why once per unfit policy. `onUnavailable` runs once per outage, shared with
 * the GraphQL field guard of the same options, and is re-armed when a fitting
 * policy is back.
 */
export function makeHeld(
	options: LimixAlxiaOptions<never>,
	guard: () => unknown,
): Held {
	const { policy } = options;
	const outage = outageOf(options);
	const checked = new WeakMap<CompiledPolicy, boolean>();
	const fits = (held: CompiledPolicy): boolean => {
		let ok = checked.get(held);
		if (ok === undefined) {
			const problems = [
				...policyProblems(held, options.app),
				...unguardedRoutes(options.app, guard()).map(
					(route) =>
						`${route}: does not run this guard (declared before its use(), or outside the scope it was used in), so it would run without the rules`,
				),
			];
			ok = problems.length === 0;
			checked.set(held, ok);
			if (!ok) {
				if (options.onMismatch) options.onMismatch(problems);
				else {
					console.error(
						`limix-alxia: the policy does not fit the app, every request is refused with 503:\n- ${problems.join('\n- ')}`,
					);
				}
			}
		}
		return ok;
	};
	return {
		snapshot() {
			const held = isPolicySource(policy) ? policy.current() : policy;
			if (held === null) {
				outage.rest(null, null);
				return unavailable('no-policy');
			}
			const ok = fits(held);
			outage.rest(ok ? held : null, held);
			return ok ? held : unavailable('policy-mismatch');
		},
	};
}
