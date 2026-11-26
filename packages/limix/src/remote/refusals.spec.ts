import { describe, expect, it } from 'bun:test';
import { codes, make, settled, track } from './harness.fixtures';
import type { createPublisher } from './publisher.fixtures';
import { AUDIENCE, ISSUER, rulesFor, T0 } from './publisher.fixtures';

describe('remotePolicy: refusals keep the last known good', () => {
	const refused = async (
		publishBad: (
			p: Awaited<ReturnType<typeof createPublisher>>,
		) => Promise<void>,
		code: string,
	) => {
		const { policy, publisher, errors } = await make();
		track(policy);
		await settled(policy);
		await publishBad(publisher);
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual([code]);
		expect(policy.version()).toBe(1);
		expect(policy.current()).not.toBeNull();
	};

	it('a tampered JWS is SIGNATURE', () =>
		refused(async (p) => {
			const [h, , s] = (await p.sign({ ver: 2, rules: rulesFor('/b') })).split(
				'.',
			);
			const forged = Buffer.from(
				JSON.stringify({ ver: 9, rules: rulesFor('/c') }),
			);
			p.state.body = `${h}.${forged.toString('base64url')}.${s}`;
			p.state.etag = '"x"';
		}, 'SIGNATURE'));

	it('a symmetric alg is refused', async () => {
		const { policy, errors } = await make(
			{},
			async (p) => void (await p.publish(1)),
			'HS256',
		);
		track(policy);
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)[0]).toBe('SIGNATURE');
		expect(policy.current()).toBeNull();
	});

	it('a wrong typ is CLAIMS', () =>
		refused(
			async (p) => void (await p.publish(2, '/a', { typ: 'jwt' })),
			'CLAIMS',
		));
	it('a wrong aud is CLAIMS', () =>
		refused(
			async (p) => void (await p.publish(2, '/a', { aud: 'other' })),
			'CLAIMS',
		));
	it('an expired token is CLAIMS', () =>
		refused(
			async (p) =>
				void (await p.publish(2, '/a', { exp: Math.floor(T0 / 1000) - 10 })),
			'CLAIMS',
		));
	it('a missing exp is CLAIMS', () =>
		refused(async (p) => {
			await p.publish(2, '/a', { exp: null });
		}, 'CLAIMS'));
	it('a missing ver is CLAIMS', () =>
		refused(async (p) => {
			p.state.body = await p.sign({ rules: rulesFor('/a') });
			p.state.etag = '"n"';
		}, 'CLAIMS'));
	it('a malformed body is SIGNATURE', () =>
		refused(async (p) => {
			p.state.body = 'not a jws';
			p.state.etag = '"n"';
		}, 'SIGNATURE'));
	it('a lower ver is STALE_VERSION', async () => {
		const { policy, publisher, errors } = await make({}, (p) =>
			p.publish(5).then(() => {}),
		);
		track(policy);
		await settled(policy);
		await publisher.publish(3);
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['STALE_VERSION']);
		expect(policy.version()).toBe(5);
	});
	it('rules the format refuses (a removed key) are RULES_REFUSED', async () => {
		const { policy, publisher, errors } = await make();
		track(policy);
		await settled(policy);
		publisher.state.body = await publisher.sign({
			ver: 2,
			rules: { rest: { '/x': { GET: { expression: { value: 'true' } } } } },
		});
		publisher.state.etag = '"r"';
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['RULES_REFUSED']);
		expect(errors[0]?.message).toStartWith(
			'Invalid rules in the pulled rules:',
		);
		expect(policy.version()).toBe(1);
	});
	it('a non-2xx status is HTTP_STATUS', () =>
		refused(async (p) => {
			p.state.status = 503;
		}, 'HTTP_STATUS'));
	it('an outage is FETCH_FAILED', () =>
		refused(async (p) => {
			p.state.down = true;
		}, 'FETCH_FAILED'));

	it('an equal ver with other rules is CLAIMS and keeps the held rules', async () => {
		const changes: number[] = [];
		const { policy, publisher, errors } = await make({
			onChange: (i: { ver: number }) => changes.push(i.ver),
		});
		track(policy);
		await settled(policy);
		await publisher.publish(1, '/other');
		publisher.state.etag = '"other"';
		expect(await policy.refresh()).toBe(false);
		expect(changes).toEqual([1]);
		expect(codes(errors)).toEqual(['CLAIMS']);
		const patterns = policy
			.current()
			?.restRoutesByMethod.get('GET')
			?.map((route) => route.pattern);
		expect(patterns).toEqual(['/a']);
	});

	it('an unsecured alg none token is SIGNATURE', () =>
		refused(async (p) => {
			const part = (value: object) =>
				Buffer.from(JSON.stringify(value)).toString('base64url');
			p.state.body = `${part({ alg: 'none', typ: 'limix-rules+jwt' })}.${part({
				ver: 2,
				rules: rulesFor('/a'),
				aud: AUDIENCE,
				iat: Math.floor(T0 / 1000),
				exp: Math.floor(T0 / 1000) + 3600,
			})}.`;
			p.state.etag = '"none"';
		}, 'SIGNATURE'));

	it('a future nbf on a live pull is CLAIMS', () =>
		refused(
			async (p) =>
				void (await p.publish(2, '/a', { nbf: Math.floor(T0 / 1000) + 600 })),
			'CLAIMS',
		));

	it('a rules refusal from compilePolicy names the pulled rules', async () => {
		const { policy, publisher, errors } = await make();
		track(policy);
		await settled(policy);
		publisher.state.body = await publisher.sign({
			ver: 2,
			rules: {
				...rulesFor('/a'),
				rest: { '/a': { GET: { when: 'nope' } } },
			},
		});
		publisher.state.etag = '"w"';
		await policy.refresh();
		expect(codes(errors)).toEqual(['RULES_REFUSED']);
		expect(errors[0]?.message).toStartWith(
			'Invalid rules in the pulled rules:',
		);
	});

	describe('redirects', () => {
		const redirecting = (inner: typeof fetch, seen: RequestInit[]) =>
			(async (input: RequestInfo | URL, init?: RequestInit) => {
				seen.push({ ...init });
				if (init?.redirect === 'error' && String(input).endsWith('/rules')) {
					throw new TypeError('fetch failed', {
						cause: new Error('unexpected redirect'),
					});
				}
				return inner(input, init);
			}) as typeof fetch;

		it('asks fetch to refuse a redirect, so the token never follows it', async () => {
			const seen: RequestInit[] = [];
			const { policy, errors } = await make({
				authToken: 'secret-token',
				wrapFetch: (inner: typeof fetch) => redirecting(inner, seen),
			});
			track(policy);
			await policy.refresh();
			expect(seen.length).toBeGreaterThan(0);
			for (const init of seen) expect(init.redirect).toBe('error');
			expect(codes(errors)[0]).toBe('FETCH_FAILED');
			expect(errors[0]?.message).toContain('redirect');
			expect(policy.current()).toBeNull();
		});

		const refusing = (inner: typeof fetch, seen: RequestInit[], path: string) =>
			(async (input: RequestInfo | URL, init?: RequestInit) => {
				seen.push({ ...init });
				if (init?.redirect === 'error' && String(input).endsWith(path)) {
					throw new TypeError('fetch failed', {
						cause: new Error('unexpected redirect'),
					});
				}
				return inner(input, init);
			}) as typeof fetch;

		it('asks for no redirect when discovering the key set from an issuer', async () => {
			const seen: RequestInit[] = [];
			const { policy, errors } = await make({
				jwksUri: undefined,
				issuer: ISSUER,
				wrapFetch: (inner: typeof fetch) =>
					refusing(inner, seen, '/.well-known/openid-configuration'),
			});
			track(policy);
			await policy.refresh();
			expect(seen.length).toBeGreaterThan(0);
			for (const init of seen) expect(init.redirect).toBe('error');
			expect(codes(errors)[0]).toBe('FETCH_FAILED');
			expect(errors[0]?.message).toContain('discovery failed');
			expect(policy.current()).toBeNull();
		});

		it('asks for no redirect when fetching the key set', async () => {
			const seen: RequestInit[] = [];
			const { policy, errors } = await make({
				wrapFetch: (inner: typeof fetch) => refusing(inner, seen, '/jwks'),
			});
			track(policy);
			await policy.refresh();
			expect(seen.length).toBeGreaterThan(1);
			for (const init of seen) expect(init.redirect).toBe('error');
			expect(errors.length).toBeGreaterThan(0);
			expect(policy.current()).toBeNull();
		});

		it('refuses a 3xx answer too', async () => {
			const { policy, publisher, errors } = await make();
			track(policy);
			await settled(policy);
			publisher.state.status = 302;
			await policy.refresh();
			expect(codes(errors)).toEqual(['HTTP_STATUS']);
			expect(errors[0]?.message).toContain('redirect');
		});
	});

	it('a string authToken never reaches a logger call or an onError message', async () => {
		const token = 'tok-9f3a-very-secret';
		const logged: string[] = [];
		const sink = (message: string, data?: Record<string, unknown>) =>
			void logged.push(message + JSON.stringify(data ?? {}));
		const { policy, publisher, errors } = await make({
			authToken: token,
			logger: { info: sink, warn: sink, error: sink },
		});
		track(policy);
		await settled(policy);
		publisher.state.down = true;
		await policy.refresh();
		publisher.state.down = false;
		publisher.state.status = 500;
		await policy.refresh();
		publisher.state.status = 200;
		publisher.state.body = 'not a jws';
		publisher.state.etag = '"bad"';
		await policy.refresh();
		expect(errors.length).toBeGreaterThanOrEqual(3);
		expect(publisher.state.auth).toContain(`Bearer ${token}`);
		for (const text of [...logged, ...errors.map((e) => e.message)]) {
			expect(text).not.toContain(token);
		}
	});
});
