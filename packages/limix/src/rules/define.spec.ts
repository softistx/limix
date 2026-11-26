import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';
import { definePolicy } from './define';
import { EXAMPLE_POLICY, EXAMPLE_YAML } from './example.fixtures';
import { parseRules } from './parse';

describe('definePolicy', () => {
	it('is the identity at run time', () => {
		const rules = { limix: 1, global: { unmatched: 'deny' } } as const;
		expect(definePolicy(rules)).toBe(rules);
	});

	it('produces exactly what parseRules returns for the same YAML document', () => {
		expect(parseRules(parse(EXAMPLE_YAML))).toEqual(EXAMPLE_POLICY);
		expect(parseRules(EXAMPLE_POLICY)).toEqual(EXAMPLE_POLICY);
	});

	it('fails to compile on a typo', () => {
		// Each line below is refused by the compiler; typecheck is the assertion.
		definePolicy({
			limix: 1,
			// @ts-expect-error `unmatched` is allow or deny
			global: { unmatched: 'alow' },
		});
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			// @ts-expect-error GTE is not a method
			rest: { '/a': { GTE: {} } },
		});
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			// @ts-expect-error `keto` was removed
			rest: { '/a': { GET: { keto: [] } } },
		});
		// @ts-expect-error limix is the format version 1
		definePolicy({ limix: 2, global: { unmatched: 'deny' } });
		// @ts-expect-error global.unmatched is required
		definePolicy({ limix: 1, global: {} });
	});
});
