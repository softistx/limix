import { afterEach } from 'bun:test';
import type { RemotePolicyError } from './errors';
import {
	AUDIENCE,
	createPublisher,
	T0,
	URL_JWKS,
	URL_RULES,
} from './publisher.fixtures';
import { remotePolicy } from './remote-policy';
import type { RemotePolicy, RemotePolicyOptions, StoredPolicy } from './types';

export type Publisher = Awaited<ReturnType<typeof createPublisher>>;

export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;
export const sec = (ms: number) => Math.floor(ms / 1000);

/** Every policy a spec starts, stopped after each test. */
export const live: RemotePolicy[] = [];
afterEach(() => {
	for (const p of live.splice(0)) p.stop();
});
export const track = (p: RemotePolicy) => {
	live.push(p);
	return p;
};

export const memoryStore = (value: StoredPolicy | null = null) => ({
	value,
	async read() {
		return this.value;
	},
	async write(v: StoredPolicy) {
		this.value = v;
	},
});

export const codes = (errors: RemotePolicyError[]): string[] =>
	errors.map((e) => e.code);

/** A started `remotePolicy` over the fake publisher, with its errors collected. */
export function boot(
	publisher: Publisher,
	extra: Partial<RemotePolicyOptions>,
	now = T0,
	omit: readonly (keyof RemotePolicyOptions)[] = [],
) {
	const errors: RemotePolicyError[] = [];
	const warnings: string[] = [];
	const changes: number[] = [];
	const options: RemotePolicyOptions = {
		rulesUrl: URL_RULES,
		audience: AUDIENCE,
		jwksUri: URL_JWKS,
		intervalMs: 3_600_000,
		fetch: publisher.fetch,
		now: () => now,
		onError: (e) => errors.push(e),
		onChange: (i) => changes.push(i.ver),
		logger: { info() {}, error() {}, warn: (m) => warnings.push(m) },
		...extra,
	};
	for (const key of omit) delete options[key];
	const policy = track(remotePolicy(options));
	return { policy, errors, warnings, changes, codes: () => codes(errors) };
}

/** `boot` over a fresh publisher (`setup` prepares it, default: publishes `ver` 1) and a clock a spec moves. */
export const make = async (
	extra: Record<string, unknown> = {},
	setup?: (p: Publisher) => Promise<void>,
	alg?: 'HS256',
) => {
	const publisher = await createPublisher(alg);
	if (setup) await setup(publisher);
	else await publisher.publish(1);
	const { wrapFetch, ...rest } = extra as {
		wrapFetch?: (inner: typeof fetch) => typeof fetch;
	};
	const clock = { t: T0 };
	const started = boot(publisher, {
		...(wrapFetch ? { fetch: wrapFetch(publisher.fetch) } : {}),
		now: () => clock.t,
		...(rest as Partial<RemotePolicyOptions>),
	});
	return { publisher, errors: started.errors, clock, policy: started.policy };
};

/** `ready` resolves at the first hold; this also waits for that pull to end. */
export const settled = async (p: RemotePolicy) => {
	await p.ready;
	await p.refresh();
};
