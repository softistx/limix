import { describe, expect, it } from 'bun:test';
import type { Condition } from './compile/types';
import { definePolicy } from './define';
import { EXAMPLE_POLICY, EXAMPLE_YAML } from './example.fixtures';
import { parseRules } from './parse';

// What the compiler refuses is never run: it would throw, as parseRules does.
const typeOnly = (_check: () => unknown): void => {};

describe('definePolicy', () => {
	it('validates at run time and returns what parseRules returns', () => {
		const rules = { limix: 1, global: { unmatched: 'deny' } } as const;
		expect(definePolicy(rules)).toEqual(parseRules(rules));
		expect(() =>
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { '/a': { GET: { roles: [[]] } } },
			}),
		).toThrow("rest['/a'].GET.roles[0]");
	});

	it('produces exactly what parseRules returns for the same YAML document', () => {
		expect(parseRules(Bun.YAML.parse(EXAMPLE_YAML))).toEqual(EXAMPLE_POLICY);
		expect(parseRules(EXAMPLE_POLICY)).toEqual(EXAMPLE_POLICY);
	});

	it('accepts any path and type while nothing is registered', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: { '/any/:thing': { GET: { authenticated: true } } },
			graphql: { AnyType: { anyField: { authenticated: true } } },
		});
		expect(rules.rest).toBeDefined();
	});

	it('fails to compile on a typo', () => {
		typeOnly(() => {
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

	it('fails to compile on a typo beside a valid key', () => {
		typeOnly(() => {
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
});

describe('definePolicy: conditions', () => {
	const unmatched = { unmatched: 'deny' } as const;
	const yes: Condition = () => true;

	it('types `when` from the conditions it is given, and never calls them', () => {
		let calls = 0;
		const conditions = {
			workingHours: () => {
				calls++;
				return true;
			},
			ownsBook: yes,
		};
		const rules = definePolicy(
			{
				limix: 1,
				global: unmatched,
				rest: { 'GET /a': { when: ['workingHours', 'ownsBook'] } },
			},
			{ conditions },
		);
		expect(rules.rest?.['/a']?.GET?.when).toEqual(['workingHours', 'ownsBook']);
		expect(calls).toBe(0);
		typeOnly(() =>
			definePolicy(
				{
					limix: 1,
					global: unmatched,
					rest: {
						// @ts-expect-error `weekend` is not one of the conditions given
						'GET /a': { when: ['weekend'] },
					},
				},
				{ conditions },
			),
		);
	});

	it('takes the names from an explicit type argument too', () => {
		const conditions = { ownsBook: yes };
		const rules = definePolicy<typeof conditions>({
			limix: 1,
			global: unmatched,
			rest: { '/a': { GET: { when: ['ownsBook'] } } },
		});
		expect(rules.rest?.['/a']?.GET?.when).toEqual(['ownsBook']);
		typeOnly(() =>
			definePolicy<typeof conditions>({
				limix: 1,
				global: unmatched,
				rest: {
					// @ts-expect-error `nope` is not in `typeof conditions`
					'/a': { GET: { when: ['nope'] } },
				},
			}),
		);
	});

	it('leaves `when` open when no conditions are given and none is declared', () => {
		const rules = definePolicy({
			limix: 1,
			global: unmatched,
			rest: { 'GET /a': { when: ['anything'] } },
		});
		expect(rules.rest?.['/a']?.GET?.when).toEqual(['anything']);
	});
});
