import { describe, expect, it } from 'bun:test';
import { RemotePolicyError } from './errors';
import { createPublisher, ISSUER, T0 } from './publisher.fixtures';
import { verifyRules } from './verify-rules';

const options = { audience: 'svc', now: () => T0 };

describe('verifyRules', () => {
	it('verifies a token against a key set and returns its claims', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.publish(3);
		const verified = await verifyRules(jws, publisher.jwks, {
			...options,
			issuer: ISSUER,
		});
		expect(verified.ver).toBe(3);
		expect(verified.schema).toBe(1);
		expect(verified.exp).toBe(T0 / 1000 + 3600);
		expect(verified.expired).toBe(false);
		expect(verified.policy.global.unmatched).toBe('deny');
	});

	it('returns an expired token with expired: true', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.publish(1);
		const verified = await verifyRules(jws, publisher.jwks, {
			audience: 'svc',
			now: () => T0 + 7_200_000,
		});
		expect(verified.expired).toBe(true);
	});

	it('refuses a wrong audience as CLAIMS', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.publish(1);
		const error = await verifyRules(jws, publisher.jwks, {
			...options,
			audience: 'other',
		}).catch((e) => e);
		expect(error).toBeInstanceOf(RemotePolicyError);
		expect(error.code).toBe('CLAIMS');
	});

	it('refuses another publisher key as SIGNATURE', async () => {
		const publisher = await createPublisher();
		const stranger = await createPublisher();
		const jws = await publisher.publish(1);
		const error = await verifyRules(jws, stranger.jwks, options).catch(
			(e) => e,
		);
		expect(error).toBeInstanceOf(RemotePolicyError);
		expect(error.code).toBe('SIGNATURE');
	});

	it('refuses a shared-secret token as SIGNATURE', async () => {
		const publisher = await createPublisher('HS256');
		const jws = await publisher.publish(1);
		const error = await verifyRules(jws, publisher.jwks, options).catch(
			(e) => e,
		);
		expect(error.code).toBe('SIGNATURE');
	});

	it('refuses a malformed key set as SIGNATURE, not a raw jose error', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.publish(1);
		for (const jwks of [{ keys: 'nope' }, null, {}] as never[]) {
			const error = await verifyRules(jws, jwks, options).catch((e) => e);
			expect(error).toBeInstanceOf(RemotePolicyError);
			expect(error.code).toBe('SIGNATURE');
			expect(error.message).toContain('the key set is malformed');
		}
	});

	it('names the token, not a pull, in a rules refusal', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.sign(
			{ ver: 1, schema: 1, rules: { limix: 1 } },
			{},
		);
		const error = await verifyRules(jws, publisher.jwks, options).catch(
			(e) => e,
		);
		expect(error.code).toBe('RULES_REFUSED');
		expect(error.message).toContain('Invalid rules in the token');
	});

	it('refuses a rule naming an unregistered condition as RULES_REFUSED', async () => {
		const publisher = await createPublisher();
		const jws = await publisher.sign(
			{
				ver: 1,
				schema: 1,
				rules: {
					limix: 1,
					global: { unmatched: 'deny' },
					rest: { '/a': { GET: { when: ['nope'] } } },
				},
			},
			{},
		);
		const refused = await verifyRules(jws, publisher.jwks, options).catch(
			(e) => e,
		);
		expect(refused.code).toBe('RULES_REFUSED');
		const accepted = await verifyRules(jws, publisher.jwks, {
			...options,
			conditions: { nope: () => true },
		});
		expect(accepted.ver).toBe(1);
	});
});
