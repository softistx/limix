import { describe, expect, it } from 'bun:test';
import { evaluateField } from '../evaluation/field';
import { anonymous, policyOf } from '../evaluation/fixtures';
import { evaluateRest } from '../evaluation/rest';
import { OUTAGE_MESSAGE, outageReporter } from './outage';
import {
	isPolicySource,
	mutableSource,
	policySource,
	staticSource,
} from './policy-source';

const policy = policyOf({ global: { unmatched: 'allow' } });
const denying = policyOf({ global: { unmatched: 'deny' } });

describe('staticSource', () => {
	it('always holds the same policy and never notifies', () => {
		const source = staticSource(policy);
		expect(source.current()).toBe(policy);
		let calls = 0;
		const off = source.subscribe(() => calls++);
		off();
		expect(calls).toBe(0);
	});
});

describe('mutableSource', () => {
	it('starts empty, holds what it is given and notifies on a swap', () => {
		const source = mutableSource();
		expect(source.current()).toBeNull();
		const seen: unknown[] = [];
		const off = source.subscribe((next) => seen.push(next));
		source.swap(policy);
		expect(source.current()).toBe(policy);
		source.swap(null);
		off();
		source.swap(policy);
		expect(seen).toEqual([policy, null]);
	});

	it('starts from an initial policy', () => {
		expect(mutableSource(policy).current()).toBe(policy);
	});
});

describe('isPolicySource', () => {
	it('tells a source from a policy and from lookalikes', () => {
		expect(isPolicySource(staticSource(policy))).toBe(true);
		expect(isPolicySource(policy)).toBe(false);
		expect(
			isPolicySource({ current: () => null, subscribe: () => () => {} }),
		).toBe(false);
		expect(isPolicySource(null)).toBe(false);
	});

	it('is checked at construction', () => {
		expect(() => policySource({ current: () => null } as never)).toThrow(
			'must both be functions',
		);
	});
});

describe('fail closed on an empty source', () => {
	const empty = mutableSource();

	it('refuses a REST request with limix.errors.unavailable', async () => {
		const decision = await evaluateRest(empty, {
			method: 'GET',
			path: '/x',
			claims: anonymous,
		});
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.code).toBe('limix.errors.unavailable');
		expect(decision.refusal.status).toBe(503);
	});

	it('refuses a field, and serves again once a policy is swapped in', async () => {
		const field = { type: 'Query', field: 'x', claims: anonymous };
		expect((await evaluateField(empty, field)).allow).toBe(false);
		empty.swap(policy);
		expect((await evaluateField(empty, field)).allow).toBe(true);
		empty.swap(denying);
		expect((await evaluateField(empty, field)).allow).toBe(false);
		empty.swap(null);
		const decision = await evaluateField(empty, field);
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.status).toBe(503);
	});
});

describe('outageReporter', () => {
	it('reports once per withdrawal and re-arms when a policy is back', () => {
		let reports = 0;
		const note = outageReporter(() => reports++);
		note(null);
		note(null);
		note(policy);
		note(null);
		expect(reports).toBe(2);
		expect(OUTAGE_MESSAGE).toContain('limix.errors.unavailable');
	});
});
