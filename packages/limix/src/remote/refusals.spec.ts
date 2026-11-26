import { describe, expect, it } from 'bun:test';
import { codes, make, settled, track } from './harness.fixtures';
import type { createPublisher } from './publisher.fixtures';
import { rulesFor, T0 } from './publisher.fixtures';

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
	it('rules the format refuses (a removed key) are RULES_REFUSED', () =>
		refused(async (p) => {
			p.state.body = await p.sign({
				ver: 2,
				rules: { rest: { '/x': { GET: { expression: { value: 'true' } } } } },
			});
			p.state.etag = '"r"';
		}, 'RULES_REFUSED'));
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
});
