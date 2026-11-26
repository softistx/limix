import { describe, expect, it } from 'bun:test';
import { codes, make, settled, track } from './harness.fixtures';
import { AUDIENCE, ISSUER, URL_JWKS, URL_RULES } from './publisher.fixtures';
import { remotePolicy } from './remote-policy';

describe('remotePolicy: a valid pull', () => {
	it('holds the rules, resolves ready and fires subscribers then onChange', async () => {
		const order: string[] = [];
		const { policy, errors } = await make({
			onChange: (i: { ver: number; previousVer: number | null }) =>
				order.push(`change ${i.previousVer}->${i.ver}`),
		});
		track(policy);
		expect(policy.current()).toBeNull();
		expect(policy.version()).toBeNull();
		policy.subscribe(() => order.push('subscriber'));
		await settled(policy);
		expect(order).toEqual(['subscriber', 'change null->1']);
		expect(policy.version()).toBe(1);
		expect(policy.current()?.restRoutesByMethod.get('GET')).toHaveLength(1);
		expect(errors).toEqual([]);
	});

	it('discovers jwks_uri once from the issuer and requires iss', async () => {
		const { policy, publisher, errors } = await make({
			jwksUri: undefined,
			issuer: ISSUER,
		});
		track(policy);
		await settled(policy);
		await publisher.publish(2);
		expect(await policy.refresh()).toBe(true);
		expect(publisher.state.calls.discovery).toBe(1);
		await publisher.publish(3, '/a', { iss: 'https://evil.test' });
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['CLAIMS']);
	});

	it('needs jwksUri or issuer, and refuses a cleartext url', () => {
		const base = { rulesUrl: URL_RULES, audience: AUDIENCE };
		expect(() => remotePolicy(base)).toThrow(TypeError);
		expect(() =>
			remotePolicy({
				...base,
				rulesUrl: 'http://pub.test/rules',
				jwksUri: URL_JWKS,
			}),
		).toThrow(/must be https/);
		expect(() =>
			remotePolicy({ ...base, jwksUri: 'http://pub.test/jwks' }),
		).toThrow(TypeError);
	});

	it('allows http on localhost, 127.0.0.1 and ::1', () => {
		for (const host of ['localhost', '127.0.0.1', '[::1]']) {
			const policy = remotePolicy({
				rulesUrl: `http://${host}:1/rules`,
				audience: AUDIENCE,
				jwksUri: `http://${host}:1/jwks`,
				fetch: (async () =>
					new Response('', { status: 503 })) as unknown as typeof fetch,
			});
			policy.stop();
		}
	});

	it('calls the token function on each pull', async () => {
		let n = 0;
		const { policy, publisher } = await make({
			authToken: async () => `t${++n}`,
		});
		track(policy);
		await settled(policy);
		await policy.refresh();
		expect(publisher.state.auth).toEqual(['Bearer t1', 'Bearer t2']);
	});

	it('sends a string token as a Bearer header', async () => {
		const { policy, publisher } = await make({ authToken: 'abc' });
		track(policy);
		await settled(policy);
		expect(publisher.state.auth[0]).toBe('Bearer abc');
	});
});

describe('remotePolicy: polling', () => {
	it('a higher ver replaces the rules', async () => {
		const { policy, publisher } = await make();
		track(policy);
		await settled(policy);
		await publisher.publish(2, '/b');
		expect(await policy.refresh()).toBe(true);
		expect(policy.version()).toBe(2);
	});

	it('a 304 keeps the rules and refreshes age', async () => {
		const { policy, publisher, clock } = await make();
		track(policy);
		await settled(policy);
		clock.t += 5_000;
		expect(policy.age()).toBe(5_000);
		expect(await policy.refresh()).toBe(false);
		expect(publisher.state.conditional.at(-1)).toBe('"v1"');
		expect(policy.age()).toBe(0);
	});

	it('age is null before anything is held', async () => {
		const { policy } = await make({}, async (p) => {
			p.state.down = true;
		});
		track(policy);
		await policy.refresh();
		expect(policy.age()).toBeNull();
	});

	it('first boot with nothing: current() null and ready pending, then recovers', async () => {
		const { policy, publisher, errors } = await make({}, async (p) => {
			p.state.down = true;
			await p.publish(1);
		});
		track(policy);
		let resolved = false;
		void policy.ready.then(() => (resolved = true));
		await policy.refresh();
		await Promise.resolve();
		expect(policy.current()).toBeNull();
		expect(resolved).toBe(false);
		expect(codes(errors).length).toBeGreaterThan(0);
		publisher.state.down = false;
		await policy.refresh();
		await settled(policy);
		expect(policy.version()).toBe(1);
	});

	it('the timer pulls on its interval, and stop() clears it', async () => {
		const { policy, publisher } = await make({ intervalMs: 20 });
		await settled(policy);
		await Bun.sleep(90);
		expect(publisher.state.calls.rules).toBeGreaterThan(2);
		policy.stop();
		await Bun.sleep(30);
		const after = publisher.state.calls.rules;
		await Bun.sleep(80);
		expect(publisher.state.calls.rules).toBe(after);
	});

	it('an unsubscribed listener is not called', async () => {
		const { policy, publisher } = await make();
		track(policy);
		await settled(policy);
		let n = 0;
		policy.subscribe(() => n++)();
		await publisher.publish(2);
		await policy.refresh();
		expect(n).toBe(0);
	});
});
