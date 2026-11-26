import type { Pkg } from './publish';
import type { Registry } from './publish-registries';
import { isTransientPublishError } from './publish-transient';

export { isTransientPublishError };

/** Waits before the 2nd and the 3rd attempt: 3 attempts in all. */
export const RETRY_DELAYS_MS: readonly number[] = [10_000, 30_000];

export type PublishResult = { ok: boolean; output: string };

export type RetryDeps = {
	sleep: (ms: number) => Promise<void>;
	/** Asks the registry whether the version is there (throws when it cannot say). */
	isPublished: (pkg: Pkg, registry: Registry) => Promise<boolean>;
	log: (line: string) => void;
};

export type Attempted = PublishResult & {
	/** The publish failed but the registry has the version: it landed. */
	landed: boolean;
};

/**
 * Runs `attempt` (one `bun publish`) up to `delays.length + 1` times while it
 * fails with a transient answer. Before each retry it waits, then asks the
 * registry again: a version found there landed despite the error. A failure
 * that is not transient, or the last one, is returned as it is.
 */
export async function publishWithRetry(
	pkg: Pkg,
	registry: Registry,
	attempt: () => Promise<PublishResult>,
	deps: RetryDeps,
	delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<Attempted> {
	const landedOnRegistry = async () => {
		try {
			return await deps.isPublished(pkg, registry);
		} catch {
			// An unreadable registry does not stop the retry.
			return false;
		}
	};
	let result = await attempt();
	for (const delay of delays) {
		if (result.ok || !isTransientPublishError(result.output)) {
			return { ...result, landed: false };
		}
		deps.log(
			`  retry     ${pkg.name}@${pkg.version}: transient npmjs failure, next attempt in ${delay / 1000} s`,
		);
		await deps.sleep(delay);
		if (await landedOnRegistry()) return { ...result, landed: true };
		result = await attempt();
	}
	// The last attempt got no wait after it, but its answer may be as wrong
	// as the earlier ones: ask once more before calling it a failure.
	if (!result.ok && isTransientPublishError(result.output)) {
		if (await landedOnRegistry()) return { ...result, landed: true };
	}
	return { ...result, landed: false };
}
