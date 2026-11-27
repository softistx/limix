import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { isLimixRefusal, mutableSource } from '@softistx/limix';
import { allowAll, ok, policy, routesOn } from './app.fixtures';
import { makeHeld } from './held';
import type { LimixAlxiaOptions } from './options';

let errors: ReturnType<typeof spyOn>;
beforeEach(() => {
	errors = spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errors.mockRestore());

const build = (options: Partial<LimixAlxiaOptions<never>>) => {
	const app = routesOn(alxia());
	const full: LimixAlxiaOptions<never> = {
		policy,
		claims: () => ({ authenticated: false }),
		app,
		...options,
	};
	return makeHeld(full);
};

describe('makeHeld', () => {
	test('a static policy that fits is returned as it is', () => {
		expect(build({}).snapshot()).toBe(policy);
	});

	test('a static policy that does not fit answers 503 policy-mismatch, and says why once', () => {
		let reports = 0;
		const held = build({
			app: alxia().get('/open', ok),
			onUnavailable: () => reports++,
		});
		const snapshot = held.snapshot();
		expect(isLimixRefusal(snapshot) && snapshot.params).toEqual({
			reason: 'policy-mismatch',
		});
		held.snapshot();
		expect(reports).toBe(1);
		expect(errors).toHaveBeenCalledTimes(1);
	});

	test('onMismatch hears the problems once per unfit policy, and console.error stays quiet', () => {
		const heard: (readonly string[])[] = [];
		const held = build({
			app: alxia().get('/open', ok),
			onMismatch: (problems) => heard.push(problems),
		});
		held.snapshot();
		held.snapshot();
		expect(heard).toHaveLength(1);
		expect(heard[0]?.some((p) => p.startsWith('GET /me'))).toBe(true);
		expect(errors).not.toHaveBeenCalled();
	});

	test('a source holding none answers 503 no-policy, reports once, and re-arms on a swap', () => {
		const source = mutableSource();
		let reports = 0;
		const held = build({ policy: source, onUnavailable: () => reports++ });
		const first = held.snapshot();
		expect(isLimixRefusal(first) && first.params).toEqual({
			reason: 'no-policy',
		});
		held.snapshot();
		expect(reports).toBe(1);
		source.swap(policy);
		expect(held.snapshot()).toBe(policy);
		source.swap(null);
		held.snapshot();
		expect(reports).toBe(2);
	});

	test('each policy a source swaps in is checked once, and a mismatch is lifted by a fitting one', () => {
		const source = mutableSource(policy);
		const held = build({ policy: source, app: alxia().get('/open', ok) });
		expect(isLimixRefusal(held.snapshot())).toBe(true);
		source.swap(allowAll);
		expect(held.snapshot()).toBe(allowAll);
		source.swap(policy);
		held.snapshot();
		expect(errors).toHaveBeenCalledTimes(1);
	});
});
