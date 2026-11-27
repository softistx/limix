import { describe, expect, it } from 'bun:test';
import {
	cnfToDnf,
	dnfImpliesCnf,
	dnfImpliesDnf,
	dnfToCnf,
	needsText,
} from './logic';

const sorted = (value: readonly (readonly string[])[] | undefined) =>
	value
		?.map((term) => [...term].sort())
		.sort((a, b) => a.join().localeCompare(b.join()));

describe('needs logic', () => {
	it('expands a CNF into its alternatives', () => {
		expect(sorted(cnfToDnf([['a', 'b'], ['c']]))).toEqual([
			['a', 'c'],
			['b', 'c'],
		]);
	});

	it('drops absorbed and duplicate alternatives', () => {
		expect(sorted(cnfToDnf([['a', 'b'], ['a']]))).toEqual([['a']]);
		expect(sorted(cnfToDnf([['a'], ['a']]))).toEqual([['a']]);
	});

	it('gives no alternative for an empty group', () => {
		expect(cnfToDnf([['a'], []])).toEqual([]);
	});

	it('returns undefined past the limit', () => {
		const groups = Array.from({ length: 11 }, (_, i) => [`a${i}`, `b${i}`]);
		expect(cnfToDnf(groups)).toBeUndefined();
		expect(cnfToDnf(groups, 5000)?.length).toBe(2048);
	});

	it('turns a DNF into a CNF and back', () => {
		const dnf = [['a'], ['b', 'c']];
		const cnf = dnfToCnf(dnf);
		expect(sorted(cnf)).toEqual([
			['a', 'b'],
			['a', 'c'],
		]);
		expect(sorted(cnfToDnf(cnf ?? []))).toEqual([['a'], ['b', 'c']]);
	});

	it('decides implication', () => {
		expect(dnfImpliesDnf([['a', 'b']], [['a']])).toBe(true);
		expect(dnfImpliesDnf([['a']], [['a', 'b']])).toBe(false);
		expect(dnfImpliesDnf([['a'], ['b']], [['a'], ['b']])).toBe(true);
		expect(dnfImpliesCnf([['a'], ['b']], [['a', 'b']])).toBe(true);
		expect(dnfImpliesCnf([['a']], [['a'], ['b']])).toBe(false);
	});

	it('writes @needs text', () => {
		expect(needsText([['a'], ['b', 'c']])).toBe(
			'@needs(permission: "a") @needs(anyOf: ["b","c"])',
		);
	});
});
