import { describe, expect, it } from 'bun:test';
import { boot, DAY, HOUR, memoryStore, sec } from './harness.fixtures';
import { createPublisher, ISSUER, rulesFor, T0 } from './publisher.fixtures';
import type { PolicyStore, StoredPolicy } from './types';

describe('a re-signed token with an equal ver', () => {
	it('is stored, so a restart after the old exp is still served', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const store = memoryStore();
		const first = boot(publisher, { store });
		await first.policy.ready;
		await first.policy.refresh();
		await publisher.publish(1, '/a', { exp: sec(T0) + 10 * DAY });
		publisher.state.etag = '"v1-resigned"';
		expect((await first.policy.refresh()).changed).toBe(false);
		expect(store.value?.jws).toBe(publisher.state.body);

		publisher.state.down = true;
		const second = boot(publisher, { store }, T0 + 5 * DAY);
		await second.policy.ready;
		expect(second.policy.version()).toBe(1);
	});
});

describe('hung inputs', () => {
	it('a token() that never resolves is FETCH_FAILED and retried', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		let calls = 0;
		const { policy, codes } = boot(publisher, {
			timeoutMs: 40,
			authToken: () => {
				calls++;
				return calls === 1 ? new Promise<string>(() => {}) : 'secret';
			},
		});
		expect((await policy.refresh()).changed).toBe(false);
		expect(codes()).toEqual(['FETCH_FAILED']);
		expect((await policy.refresh()).changed).toBe(true);
		expect(policy.version()).toBe(1);
	});

	it('a store.read() that never resolves is STORE, and the pull goes on', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const store: PolicyStore = {
			read: () => new Promise<StoredPolicy | null>(() => {}),
			write: async () => {},
		};
		const { policy, codes } = boot(publisher, { store, timeoutMs: 40 });
		await policy.ready;
		expect(policy.version()).toBe(1);
		expect(codes()).toEqual(['STORE']);
	});
});

describe('a restored copy and the live keys', () => {
	it('promotion makes its ver the floor: a replayed lower ver is STALE_VERSION', async () => {
		const publisher = await createPublisher();
		await publisher.publish(7, '/seven');
		const store = memoryStore();
		const first = boot(publisher, { store });
		await first.policy.ready;
		await first.policy.refresh();
		await publisher.publish(4, '/four');
		const second = boot(publisher, { store });
		await second.policy.ready;
		await second.policy.refresh();
		expect(second.policy.version()).toBe(7);
		expect(second.codes()).toEqual(['STALE_VERSION']);
	});

	it('keeps a verified copy when the live token fails SIGNATURE or CLAIMS', async () => {
		const publisher = await createPublisher();
		await publisher.publish(3);
		const store = memoryStore();
		const first = boot(publisher, { store });
		await first.policy.ready;
		await first.policy.refresh();

		await publisher.publish(4);
		publisher.state.body = `${publisher.state.body.slice(0, -6)}AAAAAA`;
		const bad = boot(publisher, { store });
		await bad.policy.ready;
		await bad.policy.refresh();
		expect(bad.codes()).toEqual(['SIGNATURE']);
		expect(bad.policy.version()).toBe(3);
		await publisher.publish(2);
		await bad.policy.refresh();
		expect(bad.codes()).toEqual(['SIGNATURE', 'STALE_VERSION']);

		await publisher.publish(4, '/a', { aud: 'someone-else' });
		const claims = boot(publisher, { store });
		await claims.policy.ready;
		await claims.policy.refresh();
		expect(claims.codes()).toEqual(['CLAIMS']);
		expect(claims.policy.version()).toBe(3);
		await publisher.publish(2);
		await claims.policy.refresh();
		expect(claims.codes()).toEqual(['CLAIMS', 'STALE_VERSION']);
	});

	it('drops a forged copy once the live keys load', async () => {
		const real = await createPublisher();
		const attacker = await createPublisher();
		await attacker.publish(999999, '/evil');
		real.state.down = true;
		const store = memoryStore({
			jws: attacker.state.body,
			jwks: attacker.jwks,
		});
		const { policy, codes } = boot(real, { store });
		const heard: unknown[] = [];
		policy.subscribe((next) => heard.push(next));
		await policy.ready;
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(heard.at(-1)).toBeNull();
		expect(codes()).toContain('STORE');
		expect(codes()).toContain('FETCH_FAILED');
	});

	it('refuses a stored iat in the future', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.sign({
			ver: 1,
			iat: sec(T0) + 600,
			rules: rulesFor('/a'),
		});
		publisher.state.down = true;
		const store = memoryStore({ jws, jwks: publisher.jwks });
		const { policy, codes } = boot(publisher, { store });
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(codes()).toContain('STORE');
	});
});

describe('a 304 nobody asked for', () => {
	it('is HTTP_STATUS and confirms nothing', async () => {
		const publisher = await createPublisher();
		publisher.state.always304 = true;
		const { policy, codes } = boot(publisher, {});
		expect((await policy.refresh()).changed).toBe(false);
		expect(codes()).toEqual(['HTTP_STATUS']);
		expect(policy.current()).toBeNull();
		expect(policy.age()).toBeNull();
	});
});

describe('discovery', () => {
	it('refuses a jwks_uri that is plain http', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		publisher.state.discoveryJwksUri = 'http://evil.test/jwks';
		const { policy, codes, errors } = boot(
			publisher,
			{ issuer: ISSUER },
			undefined,
			['jwksUri'],
		);

		await policy.refresh();
		expect(codes()).toEqual(['FETCH_FAILED']);
		expect(errors[0]?.message).toContain('discovered jwks_uri');
		expect(publisher.state.requested).not.toContain('http://evil.test/jwks');
		expect(policy.current()).toBeNull();
	});
});

describe('a key set the library cannot read', () => {
	it('is FETCH_FAILED and keeps the stored copy provisional', async () => {
		const publisher = await createPublisher();
		await publisher.publish(3);
		const store = memoryStore({
			jws: publisher.state.body,
			jwks: publisher.jwks,
		});
		publisher.state.jwksOverride = {};
		const { policy, codes } = boot(publisher, { store });
		await policy.ready;
		await policy.refresh();
		expect(codes()).toEqual(['FETCH_FAILED']);
		expect(policy.version()).toBe(3);
	});
});

describe('maxStaleMs at serve time', () => {
	it('withdraws a copy that crosses the bound while the publisher is away', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/a', { exp: sec(T0) + 60 });
		const store = memoryStore({
			jws: publisher.state.body,
			jwks: publisher.jwks,
		});
		const clock = { t: T0 + 60_000 + 23 * HOUR };
		const unreachable = (async () => {
			throw new TypeError('network down');
		}) as unknown as typeof fetch;
		const { policy, codes } = boot(publisher, {
			store,
			fetch: unreachable,
			now: () => clock.t,
		});
		const heard: unknown[] = [];
		policy.subscribe((next) => heard.push(next));
		await policy.ready;
		expect(policy.current()).not.toBeNull();
		clock.t += 2 * HOUR;
		expect(policy.current()).toBeNull();
		expect(heard.at(-1)).toBeNull();
		expect(codes()).toContain('EXPIRED');
	});
});
