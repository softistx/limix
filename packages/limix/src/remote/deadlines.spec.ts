import { describe, expect, it } from 'bun:test';
import { within } from './deadline';
import { RemotePolicyConfigError } from './errors';
import { boot, codes, make, memoryStore, settled } from './harness.fixtures';
import {
	createPublisher,
	ISSUER,
	URL_JWKS,
	URL_RULES,
} from './publisher.fixtures';
import { remotePolicy } from './remote-policy';
import type { PolicyStore } from './types';

const hang = () => new Promise<never>(() => {});

describe('within', () => {
	it('rejects after the delay, or when the signal aborts, even for a promise that never settles', async () => {
		await expect(within(hang(), 10)).rejects.toThrow('timed out after 10ms');
		const stop = new AbortController();
		const pending = within(hang(), 10_000, stop.signal);
		stop.abort(new Error('stopped'));
		await expect(pending).rejects.toThrow('stopped');
		expect(await within(Promise.resolve(1), 10)).toBe(1);
	});
});

describe('a call that never settles does not block the next cycle', () => {
	it('store.write()', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const store: PolicyStore = { read: async () => null, write: hang };
		const { policy, codes: seen } = boot(publisher, { store, timeoutMs: 30 });
		await policy.ready;
		await policy.refresh();
		expect(seen()).toContain('STORE');
		await publisher.publish(2, '/b');
		expect(await policy.refresh()).toBe(true);
		expect(policy.version()).toBe(2);
	});

	it('the issuer discovery', async () => {
		let stuck = true;
		const { policy, errors } = await make({
			jwksUri: undefined,
			issuer: ISSUER,
			timeoutMs: 30,
			wrapFetch: (inner: typeof fetch) =>
				((url: string, init?: RequestInit) =>
					stuck && url.endsWith('/.well-known/openid-configuration')
						? hang()
						: inner(url, init)) as typeof fetch,
		});
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toContain('FETCH_FAILED');
		stuck = false;
		expect(await policy.refresh()).toBe(true);
		expect(policy.version()).toBe(1);
	});

	it('the key set fetch', async () => {
		let stuck = true;
		const { policy, errors } = await make({
			timeoutMs: 30,
			wrapFetch: (inner: typeof fetch) =>
				((url: string, init?: RequestInit) =>
					stuck && url === URL_JWKS
						? hang()
						: inner(url, init)) as typeof fetch,
		});
		expect(await policy.refresh()).toBe(false);
		expect(errors.length).toBeGreaterThan(0);
		stuck = false;
		expect(await policy.refresh()).toBe(true);
		expect(policy.version()).toBe(1);
	});
});

describe('the key set body', () => {
	const onKeySet = (make: () => Response) => (inner: typeof fetch) =>
		((url: string, init?: RequestInit) =>
			url === URL_JWKS
				? Promise.resolve(make())
				: inner(url, init)) as typeof fetch;

	it('a body that never ends does not block the next cycle', async () => {
		let stuck = true;
		const { policy, errors } = await make({
			timeoutMs: 30,
			wrapFetch: (inner: typeof fetch) =>
				((url: string, init?: RequestInit) =>
					stuck && url === URL_JWKS
						? Promise.resolve(new Response(new ReadableStream({ start() {} })))
						: inner(url, init)) as typeof fetch,
		});
		expect(await policy.refresh()).toBe(false);
		expect(errors.length).toBeGreaterThan(0);
		stuck = false;
		expect(await policy.refresh()).toBe(true);
		expect(policy.version()).toBe(1);
	});

	it('an oversized key set is refused as TOO_LARGE', async () => {
		const { policy, errors } = await make({
			wrapFetch: onKeySet(() => new Response('x'.repeat(2 * 1_048_576))),
		});
		await policy.refresh();
		expect(codes(errors)).toContain('TOO_LARGE');
		expect(policy.current()).toBeNull();
	});
});

describe('the deadline starts after the store read', () => {
	it('a first pull succeeds although the store read outlasts timeoutMs', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const store: PolicyStore = {
			read: () =>
				new Promise((resolve) => setTimeout(() => resolve(null), 120)),
			write: async () => {},
		};
		const { policy } = boot(publisher, { store, timeoutMs: 60 });
		expect(await policy.refresh()).toBe(true);
		expect(policy.version()).toBe(1);
	});
});

describe('a body that is too large', () => {
	it('is refused as TOO_LARGE before it is all read', async () => {
		const { policy, errors } = await make({
			wrapFetch: (inner: typeof fetch) =>
				((url: string, init?: RequestInit) =>
					url === URL_RULES
						? Promise.resolve(new Response('x'.repeat(2 * 1_048_576)))
						: inner(url, init)) as typeof fetch,
		});
		await policy.refresh();
		expect(codes(errors)).toContain('TOO_LARGE');
		expect(policy.current()).toBeNull();
	});
});

describe('a key the key set lacks', () => {
	it('discovers the key set URL again, once, instead of caching it forever', async () => {
		const old = 'https://pub.test/old-jwks';
		let fake!: Awaited<ReturnType<typeof createPublisher>>;
		const { policy, publisher } = await make(
			{
				jwksUri: undefined,
				issuer: ISSUER,
				wrapFetch: (inner: typeof fetch) => {
					return ((url: string, init?: RequestInit) => {
						if (url === old)
							return Promise.resolve(Response.json({ keys: [] }));
						const answer = inner(url, init);
						// The issuer moves its key set after the first discovery.
						if (url.endsWith('/.well-known/openid-configuration')) {
							fake.state.discoveryJwksUri = URL_JWKS;
						}
						return answer;
					}) as typeof fetch;
				},
			},
			async (p) => {
				fake = p;
				p.state.discoveryJwksUri = old;
				await p.publish(1);
			},
		);
		await settled(policy);
		expect(policy.version()).toBe(1);
		expect(publisher.state.calls.discovery).toBe(2);
	});
});

describe('trustedKeys', () => {
	it('warns when the live key set holds a key it does not list', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const { policy, warnings } = boot(publisher, {
			store: memoryStore(),
			trustedKeys: ['not-the-thumbprint'],
		});
		await settled(policy);
		expect(warnings.some((w) => w.includes('not in trustedKeys'))).toBe(true);
	});
});

describe('numeric options', () => {
	const base = {
		rulesUrl: URL_RULES,
		audience: 'svc',
		jwksUri: URL_JWKS,
	};

	it('refuses a maxStaleMs that is NaN, 0 or negative instead of failing open', () => {
		for (const maxStaleMs of [Number.NaN, 0, -1]) {
			expect(() => remotePolicy({ ...base, maxStaleMs })).toThrow(
				RemotePolicyConfigError,
			);
		}
	});

	it('refuses an intervalMs or timeoutMs that is NaN, 0, negative or infinite', () => {
		for (const bad of [Number.NaN, 0, -5, Infinity]) {
			expect(() => remotePolicy({ ...base, intervalMs: bad })).toThrow(
				RemotePolicyConfigError,
			);
			expect(() => remotePolicy({ ...base, timeoutMs: bad })).toThrow(
				RemotePolicyConfigError,
			);
		}
	});

	it('refuses a fractional or timer-overflowing intervalMs or timeoutMs', () => {
		for (const bad of [1.5, 2_147_483_648]) {
			expect(() => remotePolicy({ ...base, intervalMs: bad })).toThrow(
				RemotePolicyConfigError,
			);
			expect(() => remotePolicy({ ...base, timeoutMs: bad })).toThrow(
				RemotePolicyConfigError,
			);
		}
	});

	it('accepts maxStaleMs: Infinity', async () => {
		const publisher = await createPublisher();
		await publisher.publish(1);
		const { policy } = boot(publisher, { maxStaleMs: Infinity });
		await settled(policy);
		expect(policy.version()).toBe(1);
	});
});
