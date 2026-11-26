import { describe, expect, it } from 'bun:test';
import { exportJWK, generateKeyPair } from 'jose';
import {
	boot,
	HOUR,
	memoryStore,
	type Publisher,
	sec,
} from './harness.fixtures';
import { createPublisher, rulesFor, T0 } from './publisher.fixtures';

describe('a key set with several candidate keys (rotation)', () => {
	const rotating = async (publisher: Publisher) => {
		const { publicKey } = await generateKeyPair('ES256');
		const other = { ...(await exportJWK(publicKey)), kid: 'k2', alg: 'ES256' };
		publisher.state.jwksOverride = { keys: [other, ...publisher.jwks.keys] };
	};

	it('verifies an honest token that has no kid', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/a', { kid: null });
		await rotating(publisher);
		const { policy, codes } = boot(publisher, {});
		await policy.ready;
		expect(policy.version()).toBe(1);
		expect(codes()).toEqual([]);
	});

	it('drops a forged stored token that has no kid, and serves the live one', async () => {
		const real = await createPublisher();
		const attacker = await createPublisher();
		await attacker.publish(999, '/evil', { kid: null });
		await real.publish(2, '/real');
		await rotating(real);
		const store = memoryStore({
			jws: attacker.state.body,
			jwks: attacker.jwks,
		});
		const { policy, codes } = boot(real, { store });
		await policy.ready;
		await policy.refresh();
		expect(codes()).toEqual(['STORE']);
		expect(policy.version()).toBe(2);
	});

	it('refuses a forged live token that has no kid as SIGNATURE, holding nothing', async () => {
		const real = await createPublisher();
		const attacker = await createPublisher();
		await attacker.publish(999, '/evil', { kid: null });
		await rotating(real);
		real.state.body = attacker.state.body;
		real.state.etag = '"v999"';
		const { policy, codes } = boot(real, {});
		await policy.refresh();
		expect(codes()).toContain('SIGNATURE');
		expect(policy.current()).toBeNull();
		expect(policy.version()).toBeNull();
	});
});

describe('serve-time bound without a current() call', () => {
	it('a 304 past exp + maxStaleMs still withdraws the copy', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1, '/a', { exp: sec(T0) + 60 });
		const clock = { t: T0 };
		const { policy } = boot(publisher, { now: () => clock.t });
		const heard: unknown[] = [];
		policy.subscribe((next) => heard.push(next));
		await policy.ready;
		await policy.refresh();
		clock.t += 60_000 + 25 * HOUR;
		await policy.refresh();
		expect(heard.at(-1)).toBeNull();
	});

	it('keeps the ver floor across a withdrawal', async () => {
		const publisher = await createPublisher();
		await publisher.publish(5, '/a', { exp: sec(T0) + 60 });
		const clock = { t: T0 };
		const { policy, codes } = boot(publisher, { now: () => clock.t });
		await policy.ready;
		await policy.refresh();
		clock.t += 60_000 + 25 * HOUR;
		publisher.state.down = true;
		await policy.refresh();
		expect(policy.current()).toBeNull();
		publisher.state.down = false;
		await publisher.publish(4, '/a', { exp: sec(clock.t) + 3600 });
		await policy.refresh();
		expect(codes()).toContain('STALE_VERSION');
		expect(policy.current()).toBeNull();
	});
});

describe('the stored iat clock tolerance', () => {
	it('accepts an iat 30 s ahead of this clock', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.sign({
			ver: 1,
			iat: sec(T0) + 30,
			rules: rulesFor('/a'),
		});
		publisher.state.down = true;
		const store = memoryStore({ jws, jwks: publisher.jwks });
		const { policy } = boot(publisher, { store });
		await policy.ready;
		expect(policy.version()).toBe(1);
	});
});

describe('the rules at the ver floor after a withdrawal', () => {
	const withdrawn = async () => {
		const publisher = await createPublisher();
		await publisher.publish(5, '/a', { exp: sec(T0) + 60 });
		const clock = { t: T0 };
		const { policy, codes } = boot(publisher, { now: () => clock.t });
		await policy.ready;
		clock.t += 60_000 + 25 * HOUR;
		publisher.state.down = true;
		await policy.refresh();
		expect(policy.current()).toBeNull();
		publisher.state.down = false;
		return { publisher, policy, codes, clock };
	};

	it('refuses other rules at an equal ver as CLAIMS', async () => {
		const { publisher, policy, codes, clock } = await withdrawn();
		await publisher.publish(5, '/other', { exp: sec(clock.t) + 3600 });
		await policy.refresh();
		expect(codes()).toContain('CLAIMS');
		expect(policy.current()).toBeNull();
	});

	it('accepts the same rules re-signed at an equal ver', async () => {
		const { publisher, policy, clock } = await withdrawn();
		await publisher.publish(5, '/a', { exp: sec(clock.t) + 3600 });
		await policy.refresh();
		expect(policy.version()).toBe(5);
	});
});
