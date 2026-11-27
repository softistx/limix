import { describe, expect, test } from 'bun:test';
import { mutableSource } from '@softistx/limix';
import { policy } from './app.fixtures';
import type { LimixAlxiaOptions } from './options';
import { outageOf } from './outage';

function options() {
	const source = mutableSource(policy);
	const calls = { n: 0 };
	const full: LimixAlxiaOptions<never> = {
		policy: source,
		claims: () => ({ authenticated: false }),
		app: { routes: [] },
		onUnavailable: () => calls.n++,
	};
	return { full, source, calls };
}

describe('outageOf', () => {
	test('one state per options object', () => {
		const { full } = options();
		expect(outageOf(full)).toBe(outageOf(full));
		expect(outageOf(options().full)).not.toBe(outageOf(full));
	});

	test('REST then GraphQL report once, a fitting policy re-arms', () => {
		const { full, source, calls } = options();
		const outage = outageOf(full);
		source.swap(null);
		outage.rest(null, null);
		outage.graphql();
		expect(calls.n).toBe(1);
		source.swap(policy);
		outage.rest(policy, policy);
		source.swap(null);
		outage.graphql();
		expect(calls.n).toBe(2);
	});

	test('a recovery seen only through the watched source ends the outage', () => {
		const { full, source, calls } = options();
		const outage = outageOf(full);
		const watched = outage.watch(full.policy) as typeof source;
		source.swap(null);
		outage.graphql();
		outage.graphql();
		expect(calls.n).toBe(1);
		source.swap(policy);
		expect(watched.current()).toBe(policy);
		source.swap(null);
		outage.graphql();
		expect(calls.n).toBe(2);
	});

	test('a static policy is watched as it is', () => {
		const { full } = options();
		expect(outageOf(full).watch(policy)).toBe(policy);
	});
});
