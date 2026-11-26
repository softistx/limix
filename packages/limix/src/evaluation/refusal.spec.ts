import { describe, expect, it } from 'bun:test';
import { isLimixRefusal, LIMIX_REFUSAL, LimixRefusal } from './refusal';

describe('LimixRefusal', () => {
	it('carries a neutral code, status and params, and no HTTP type', () => {
		const refusal = new LimixRefusal('auth.errors.forbidden', 403, { a: 1 });
		expect(refusal.code).toBe('auth.errors.forbidden');
		expect(refusal.status).toBe(403);
		expect(refusal.params).toEqual({ a: 1 });
		expect(refusal).toBeInstanceOf(Error);
	});

	it('is registered under Symbol.for so another copy is recognised', () => {
		expect(Symbol.keyFor(LIMIX_REFUSAL)).toBe('limix.refusal');
	});
});

describe('isLimixRefusal', () => {
	it('recognises an instance and a lookalike carrying the registered symbol', () => {
		expect(isLimixRefusal(new LimixRefusal('x', 400))).toBe(true);
		expect(
			isLimixRefusal({ [Symbol.for('limix.refusal')]: true, code: 'x' }),
		).toBe(true);
	});

	it('refuses everything else', () => {
		for (const value of [null, undefined, 'x', {}, new Error('x')]) {
			expect(isLimixRefusal(value)).toBe(false);
		}
	});
});
