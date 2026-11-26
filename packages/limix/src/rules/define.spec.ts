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

	it('fails to compile on a typo beside a valid key', () => {
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'/a': {
					GET: {
						authenticated: true,
						// @ts-expect-error `permisions` is not a key, though `authenticated` is
						permisions: [['a']],
					},
				},
			},
		});
		definePolicy({
			limix: 1,
			global: {
				unmatched: 'deny',
				// @ts-expect-error `basepath` is not a key, though `unmatched` is
				basepath: '/api',
			},
		});
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'/a': {
					GET: {
						relations: [
							{
								require: [
									[
										{
											relation: 'view',
											type: 'doc',
											// @ts-expect-error `form` is not a key of a relation term
											form: 'param.id',
										},
									],
								],
							},
						],
					},
				},
			},
		});
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'/a': {
					GET: { authenticated: true },
					// @ts-expect-error `PSOT` is not a method, though `GET` is
					PSOT: { authenticated: true },
				},
			},
		});
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {},
			// @ts-expect-error `rset` is not a top-level key, though `rest` is
			rset: {},
		});
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			graphql: {
				Query: {
					a: {
						authenticated: true,
						// @ts-expect-error `rolse` is not a key, though `authenticated` is
						rolse: [['admin']],
					},
				},
			},
		});
	});
});
