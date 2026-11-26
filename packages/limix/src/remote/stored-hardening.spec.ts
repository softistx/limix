import { describe, expect, it } from 'bun:test';
import { calculateJwkThumbprint } from 'jose';
import { boot, memoryStore } from './harness.fixtures';
import { createPublisher, T0 } from './publisher.fixtures';
import type { PolicyStore, RemotePolicyOptions } from './types';

const stale = (exp: number) => ({ exp: Math.floor(T0 / 1000) + exp });

describe('a forged store', () => {
	it('with its own key set and ver 999999 does not block a real ver 2 pull', async () => {
		const real = await createPublisher();
		const attacker = await createPublisher();
		await real.publish(2, '/real');
		await attacker.publish(999999, '/evil');
		const store = memoryStore({
			jws: attacker.state.body,
			jwks: attacker.jwks,
		});
		const { policy, errors, changes } = boot(real, { store });
		await policy.ready;
		await policy.refresh();
		expect(policy.version()).toBe(2);
		expect(errors.map((e) => e.code)).toEqual(['STORE']);
		expect(changes).toEqual([999999, 2]);
		expect(store.value?.jws).toBe(real.state.body);
	});

	it('is ignored when trustedKeys does not list its keys', async () => {
		const real = await createPublisher();
		const attacker = await createPublisher();
		await attacker.publish(5);
		real.state.down = true;
		const store = memoryStore({
			jws: attacker.state.body,
			jwks: attacker.jwks,
		});
		const trusted = await calculateJwkThumbprint(real.jwks.keys[0] as never);
		const { policy, errors } = boot(real, { store, trustedKeys: [trusted] });
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(errors.map((e) => e.code)).toContain('STORE');
	});

	it('is accepted when every stored key is trusted', async () => {
		const real = await createPublisher();
		await real.publish(3);
		const store = memoryStore({ jws: real.state.body, jwks: real.jwks });
		real.state.down = true;
		const trusted = await calculateJwkThumbprint(real.jwks.keys[0] as never);
		const { policy } = boot(real, { store, trustedKeys: [trusted] });
		await policy.ready;
		expect(policy.version()).toBe(3);
	});
});

describe('a stale store', () => {
	const expired = async (
		exp: number,
		extra: Partial<RemotePolicyOptions>,
		nowOffset: number,
	) => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/a', stale(exp));
		const store = memoryStore({
			jws: publisher.state.body,
			jwks: publisher.jwks,
		});
		publisher.state.down = true;
		return boot(publisher, { store, ...extra }, T0 + nowOffset);
	};
	const HOUR = 3_600_000;

	it('is refused beyond maxStaleMs past exp (default 24 h), failing closed', async () => {
		const { policy, errors } = await expired(60, {}, 25 * HOUR);
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(errors.map((e) => e.code)).toContain('STORE');
	});

	it('is served within the bound, and maxStaleMs is configurable', async () => {
		const within = await expired(60, {}, 2 * HOUR);
		await within.policy.ready;
		expect(within.policy.version()).toBe(1);
		const tight = await expired(60, { maxStaleMs: HOUR }, 2 * HOUR);
		await tight.policy.refresh();
		expect(tight.policy.current()).toBeNull();
	});

	it('Infinity never refuses', async () => {
		const { policy } = await expired(
			60,
			{ maxStaleMs: Number.POSITIVE_INFINITY },
			1000 * HOUR,
		);
		await policy.ready;
		expect(policy.version()).toBe(1);
	});

	it('reports age() from the token iat', async () => {
		const { policy } = await expired(3600, {}, 7_000);
		await policy.ready;
		expect(policy.age()).toBe(7_000);
	});

	it('refuses a token whose nbf is still in the future', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/a', { nbf: Math.floor(T0 / 1000) + 600 });
		const store = memoryStore({
			jws: publisher.state.body,
			jwks: publisher.jwks,
		});
		publisher.state.down = true;
		const { policy, errors } = boot(publisher, { store });
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(errors.map((e) => e.code)).toContain('STORE');
	});
});

describe('a slow store read racing the first pull', () => {
	it('settles first, so the pull replaces it and nothing regresses', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/old');
		const saved = { jws: publisher.state.body, jwks: publisher.jwks };
		await publisher.publish(2, '/new');
		const store: PolicyStore = {
			read: async () => {
				await Bun.sleep(40);
				return saved;
			},
			write: async () => {},
		};
		const { policy, changes } = boot(publisher, { store });
		await policy.ready;
		await policy.refresh();
		expect(policy.version()).toBe(2);
		expect(changes).toEqual([1, 2]);
	});
});
