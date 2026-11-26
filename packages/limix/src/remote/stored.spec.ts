import { afterEach, describe, expect, it } from 'bun:test';
import type { RemotePolicyError } from './errors';
import {
	AUDIENCE,
	createPublisher,
	T0,
	URL_JWKS,
	URL_RULES,
} from './publisher.fixtures';
import { remotePolicy } from './remote-policy';
import type { PolicyStore, RemotePolicy, StoredPolicy } from './types';

const live: RemotePolicy[] = [];
afterEach(() => {
	for (const p of live.splice(0)) p.stop();
});

const memoryStore = (
	value: StoredPolicy | null = null,
): PolicyStore & { value: StoredPolicy | null } => ({
	value,
	async read() {
		return this.value;
	},
	async write(v) {
		this.value = v;
	},
});

function boot(
	publisher: Awaited<ReturnType<typeof createPublisher>>,
	store: PolicyStore,
	now = T0,
	warnings: string[] = [],
	errors: RemotePolicyError[] = [],
) {
	const policy = remotePolicy({
		rulesUrl: URL_RULES,
		audience: AUDIENCE,
		jwksUri: URL_JWKS,
		intervalMs: 3_600_000,
		fetch: publisher.fetch,
		now: () => now,
		store,
		onError: (e) => errors.push(e),
		logger: { info() {}, error() {}, warn: (m) => warnings.push(m) },
	});
	live.push(policy);
	return policy;
}

describe('remotePolicy: the store', () => {
	it('survives a restart: the second instance holds the policy before any network call', async () => {
		const publisher = await createPublisher();
		await publisher.publish(4);
		const store = memoryStore();
		const first = boot(publisher, store);
		await first.ready;
		await first.refresh();
		expect(store.value?.etag).toBe('"v4"');
		expect(store.value?.jwks.keys).toHaveLength(1);

		publisher.state.down = true;
		const before = publisher.state.calls.rules;
		const second = boot(publisher, store);
		await second.ready;
		expect(second.version()).toBe(4);
		expect(second.current()).not.toBeNull();
		// ready resolved from the store; the first pull of the second instance
		// is the only network call, and it fails without losing the rules.
		expect(publisher.state.calls.rules - before).toBeLessThanOrEqual(1);
	});

	it('pulls unconditionally after a restart, then sends the live etag', async () => {
		const publisher = await createPublisher();
		await publisher.publish(2);
		const store = memoryStore();
		await boot(publisher, store).ready;
		const second = boot(publisher, store);
		await second.ready;
		await second.refresh();
		expect(publisher.state.conditional.at(-1)).toBeNull();
		expect(second.version()).toBe(2);
		await second.refresh();
		expect(publisher.state.conditional.at(-1)).toBe('"v2"');
	});

	it('does not let a stored etag hide a newer policy', async () => {
		const publisher = await createPublisher();
		await publisher.publish(3);
		const store = memoryStore({
			jws: publisher.state.body,
			jwks: publisher.jwks,
			etag: '"v7"',
		});
		await publisher.publish(7);
		const restarted = boot(publisher, store);
		await restarted.ready;
		await restarted.refresh();
		expect(restarted.version()).toBe(7);
	});

	it('serves an expired stored copy as last known good, with a warning', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/a', { exp: Math.floor(T0 / 1000) + 60 });
		const store = memoryStore();
		await boot(publisher, store).ready;
		publisher.state.down = true;
		const warnings: string[] = [];
		const later = boot(publisher, store, T0 + 3_600_000, warnings);
		await later.ready;
		expect(later.version()).toBe(1);
		expect(warnings.some((w) => w.includes('expired'))).toBe(true);
	});

	it('ignores a stored copy whose signature does not verify, reporting STORE', async () => {
		const publisher = await createPublisher();
		const other = await createPublisher();
		await publisher.publish(1);
		await other.publish(1);
		const store = memoryStore();
		store.value = { jws: other.state.body, jwks: publisher.jwks };
		publisher.state.down = true;
		const errors: RemotePolicyError[] = [];
		const policy = boot(publisher, store, T0, [], errors);
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(errors.map((e) => e.code)).toContain('STORE');
	});

	it('reports a failing store through onError and keeps serving', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const errors: RemotePolicyError[] = [];
		const store: PolicyStore = {
			read: async () => {
				throw new Error('read boom');
			},
			write: async () => {
				throw new Error('write boom');
			},
		};
		const policy = boot(publisher, store, T0, [], errors);
		await policy.ready;
		await policy.refresh();
		expect(policy.version()).toBe(1);
		expect(errors.map((e) => e.code)).toEqual(['STORE', 'STORE']);
	});
});
