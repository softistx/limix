/** The log line for a withdrawn policy. */
export const OUTAGE_MESSAGE =
	'Policy source unavailable (limix.errors.unavailable): it holds no policy, every request is refused';

/**
 * Reports "the source holds no policy" once per withdrawal, not once per call:
 * call the returned function with `source.current()` each time; it runs
 * `report` on the transition to `null` and re-arms when a policy is back.
 */
export function outageReporter(
	report: () => void,
): (policy: unknown | null) => void {
	let down = false;
	return (policy) => {
		if (policy) {
			down = false;
			return;
		}
		if (down) return;
		down = true;
		report();
	};
}
