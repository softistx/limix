/** The message of anything thrown. */
export const messageOf = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

/**
 * `work`, or a rejection once `ms` have passed or `signal` aborts, whichever
 * comes first, even when `work` ignores both and never settles. The one
 * deadline every awaited external call (fetch, store, token, discovery) goes
 * through; what `work` does afterwards is its own business.
 */
export function within<T>(
	work: Promise<T>,
	ms: number,
	signal?: AbortSignal,
): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => finish(() => reject(signal?.reason));
		const timer = setTimeout(
			() => finish(() => reject(new Error(`timed out after ${ms}ms`))),
			ms,
		);
		function finish(settle: () => void) {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			settle();
		}
		if (signal?.aborted) return onAbort();
		signal?.addEventListener('abort', onAbort, { once: true });
		work.then(
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error)),
		);
	});
}
