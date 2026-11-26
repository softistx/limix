import { describe, expect, it } from 'bun:test';
import { anonymous } from '../evaluation/evaluation.fixtures';
import { evaluateRest } from '../evaluation/rest';
import { DEFAULT_TYP } from './defaults';
import { codes, HOUR, make, settled, track } from './harness.fixtures';
import { rulesFor, T0 } from './publisher.fixtures';

const when = (name: string) => ({
	limix: 1,
	global: { unmatched: 'deny' },
	rest: { '/a': { GET: { authenticated: true, when: [name] } } },
});

describe('remotePolicy: the limix token', () => {
	it('defaults the typ to limix-rules+jwt', async () => {
		expect(DEFAULT_TYP).toBe('limix-rules+jwt');
		const { policy, errors } = await make();
		track(policy);
		await settled(policy);
		expect(policy.version()).toBe(1);
		expect(errors).toEqual([]);
	});

	it('refuses the old typ rules+jwt unless the option names it', async () => {
		const { policy, errors, publisher } = await make();
		track(policy);
		await settled(policy);
		await publisher.publish(2, '/a', { typ: 'rules+jwt' });
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['CLAIMS']);
		expect(policy.version()).toBe(1);
	});

	it('accepts a custom typ', async () => {
		const { policy, publisher } = await make({ typ: 'mine+jwt' }, async (p) => {
			await p.publish(1, '/a', { typ: 'mine+jwt' });
		});
		track(policy);
		await settled(policy);
		expect(policy.version()).toBe(1);
		await publisher.publish(2, '/a', { typ: 'mine+jwt' });
		expect(await policy.refresh()).toBe(true);
	});

	it('a schema claim other than the format version is CLAIMS', async () => {
		const { policy, errors, publisher } = await make();
		track(policy);
		await settled(policy);
		publisher.state.body = await publisher.sign({
			ver: 2,
			schema: 2,
			rules: rulesFor('/b'),
		});
		publisher.state.etag = '"s2"';
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['CLAIMS']);
		expect(errors[0]?.message).toContain('schema');
		expect(policy.version()).toBe(1);
	});

	it('a token without a schema claim is accepted', async () => {
		const { policy, publisher } = await make();
		track(policy);
		await settled(policy);
		publisher.state.body = await publisher.sign({
			ver: 2,
			rules: rulesFor('/b'),
		});
		publisher.state.etag = '"s0"';
		expect(await policy.refresh()).toBe(true);
	});
});

describe('remotePolicy: rules and conditions', () => {
	it('a RulesError in a pulled document keeps the last good copy and reports it', async () => {
		const { policy, errors, publisher } = await make();
		track(policy);
		await settled(policy);
		publisher.state.body = await publisher.sign({
			ver: 2,
			rules: {
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { '/x': { GET: { public: true, roles: [['admin']] } } },
			},
		});
		publisher.state.etag = '"bad"';
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['RULES_REFUSED']);
		expect(errors[0]?.message).toContain('Invalid rules');
		expect(policy.version()).toBe(1);
		expect(policy.current()).not.toBeNull();
	});

	it('a rule naming an unregistered condition is RULES_REFUSED', async () => {
		const { policy, errors, publisher } = await make();
		track(policy);
		await settled(policy);
		publisher.state.body = await publisher.sign({
			ver: 2,
			rules: when('nope'),
		});
		publisher.state.etag = '"c"';
		expect(await policy.refresh()).toBe(false);
		expect(codes(errors)).toEqual(['RULES_REFUSED']);
		expect(policy.version()).toBe(1);
	});

	it('compiles the pulled rules with the conditions passed in the options', async () => {
		let asked = 0;
		const { policy, publisher } = await make(
			{
				conditions: {
					open: () => {
						asked++;
						return false;
					},
				},
			},
			async (p) => {
				p.state.body = await p.sign({ ver: 1, rules: when('open') });
				p.state.etag = '"w"';
			},
		);
		track(policy);
		await settled(policy);
		expect(publisher.state.calls.rules).toBeGreaterThan(0);
		const decision = await evaluateRest(policy, {
			method: 'GET',
			path: '/a',
			claims: { authenticated: true },
		});
		expect(asked).toBe(1);
		expect(decision.allow).toBe(false);
	});
});

describe('remotePolicy: serving through an evaluator', () => {
	it('refuses with limix.errors.unavailable while nothing is held, then serves, then fails closed past maxStaleMs', async () => {
		const { policy, publisher, clock } = await make(
			{ maxStaleMs: HOUR },
			async (p) => {
				p.state.down = true;
				await p.publish(1);
			},
		);
		track(policy);
		const request = { method: 'GET', path: '/a', claims: anonymous };
		const before = await evaluateRest(policy, request);
		if (before.allow) throw new Error('expected a refusal');
		expect(before.refusal.code).toBe('limix.errors.unavailable');

		publisher.state.down = false;
		await policy.refresh();
		expect((await evaluateRest(policy, request)).allow).toBe(true);

		// An outage: the last good copy keeps serving until exp + maxStaleMs.
		publisher.state.down = true;
		clock.t = T0 + 3_600_000 + HOUR / 2;
		await policy.refresh();
		expect((await evaluateRest(policy, request)).allow).toBe(true);

		clock.t = T0 + 3_600_000 + 2 * HOUR;
		const after = await evaluateRest(policy, request);
		if (after.allow) throw new Error('expected a refusal');
		expect(after.refusal.code).toBe('limix.errors.unavailable');
		expect(policy.current()).toBeNull();
	});
});
