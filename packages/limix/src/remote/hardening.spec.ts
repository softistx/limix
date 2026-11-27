import { describe, expect, it } from 'bun:test';
import { codes, make, settled, track } from './harness.fixtures';
import { ISSUER, URL_RULES } from './publisher.fixtures';
import type { PolicyStore, StoredPolicy } from './types';

describe('remotePolicy: transport', () => {
	it('retries a never-resolving fetch on the next tick', async () => {
		let hang = true;
		const { policy, errors } = await make({
			timeoutMs: 20,
			intervalMs: 60,
			wrapFetch: (inner: typeof fetch) =>
				((url: string, init?: RequestInit) =>
					hang && url === URL_RULES
						? new Promise<Response>(() => {})
						: inner(url, init)) as typeof fetch,
		});
		track(policy);
		await Bun.sleep(40);
		expect(codes(errors)).toEqual(['FETCH_FAILED']);
		expect(policy.current()).toBeNull();
		hang = false;
		await policy.ready;
		expect(policy.version()).toBe(1);
	});

	it('stop() aborts the in-flight pull: nothing is held, notified or written', async () => {
		let open!: () => void;
		const gate = new Promise<void>((resolve) => {
			open = resolve;
		});
		const writes: StoredPolicy[] = [];
		const store: PolicyStore = {
			read: async () => null,
			write: async (v) => void writes.push(v),
		};
		const changes: number[] = [];
		const { policy, errors } = await make({
			store,
			onChange: (i: { ver: number }) => changes.push(i.ver),
			wrapFetch: (inner: typeof fetch) =>
				(async (url: string, init?: RequestInit) => {
					if (url === URL_RULES) await gate;
					return inner(url, init);
				}) as typeof fetch,
		});
		await Bun.sleep(10);
		policy.stop();
		open();
		expect((await policy.refresh()).changed).toBe(false);
		await Bun.sleep(20);
		expect(policy.current()).toBeNull();
		expect(changes).toEqual([]);
		expect(writes).toEqual([]);
		expect(errors).toEqual([]);
	});
});

describe('remotePolicy: issuer and keys', () => {
	it('checks iss when issuer is given with jwksUri, without discovery', async () => {
		const { policy, publisher, errors } = await make({ issuer: ISSUER });
		track(policy);
		await settled(policy);
		await publisher.publish(2, '/a', { iss: 'https://evil.test' });
		expect((await policy.refresh()).changed).toBe(false);
		expect(codes(errors)).toEqual(['CLAIMS']);
		expect(publisher.state.calls.discovery).toBe(0);
	});

	it('refuses a discovery document naming another issuer', async () => {
		const { policy, errors } = await make(
			{ jwksUri: undefined, issuer: ISSUER },
			async (p) => {
				p.state.discoveryIssuer = 'https://evil.test';
				await p.publish(1);
			},
		);
		track(policy);
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(codes(errors)[0]).toBe('FETCH_FAILED');
		expect(errors[0]?.message).toContain('evil.test');
	});

	it('normalises a trailing slash on the issuer', async () => {
		const { policy } = await make(
			{ jwksUri: undefined, issuer: ISSUER },
			async (p) => {
				p.state.discoveryIssuer = `${ISSUER}/`;
				await p.publish(1);
			},
		);
		track(policy);
		await settled(policy);
		expect(policy.version()).toBe(1);
	});

	it('pins algorithms: an oct key in the JWKS and an HS256 token are refused', async () => {
		const { policy, publisher, errors } = await make(
			{},
			async (p) => void (await p.publish(1)),
			'HS256',
		);
		track(policy);
		expect(publisher.jwks.keys[0]?.kty).toBe('oct');
		await policy.refresh();
		expect(policy.current()).toBeNull();
		expect(codes(errors)[0]).toBe('SIGNATURE');
	});
});
