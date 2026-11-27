import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy, mutableSource } from '@softistx/limix';
import { checkOptions, type LimixAlxiaOptions } from './options';

const open = compilePolicy(
	definePolicy({ limix: 1, global: { unmatched: 'allow' } }),
);
const withRelations = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'allow' },
		rest: {
			'/notes/:id': {
				GET: {
					relations: [
						{
							require: [
								[{ relation: 'viewer', type: 'note', from: 'param.id' }],
							],
						},
					],
				},
			},
		},
	}),
);
const base = (): LimixAlxiaOptions<never> => ({
	policy: open,
	claims: () => ({ authenticated: false }),
	app: alxia(),
});
const check = (options: object) =>
	checkOptions('limixGuard()', options as LimixAlxiaOptions<never>);

describe('checkOptions', () => {
	test('accepts a compiled policy and a source', () => {
		expect(() => check(base())).not.toThrow();
		expect(() => check({ ...base(), policy: mutableSource() })).not.toThrow();
	});

	test('names the caller in every refusal', () => {
		const cases: [object, RegExp][] = [
			[null as never, /pass the options/],
			[{ ...base(), policy: undefined }, /pass `policy`/],
			[{ ...base(), policy: {} }, /neither a compiled policy/],
			[{ ...base(), claims: undefined }, /pass `claims`/],
			[{ ...base(), app: undefined }, /pass `app`/],
			[{ ...base(), app: {} }, /pass `app`/],
			[{ ...base(), mapRefusal: 3 }, /`mapRefusal` is a function/],
			[{ ...base(), onMismatch: 3 }, /`onMismatch` is a function/],
		];
		for (const [options, message] of cases) {
			expect(() => check(options)).toThrow(message);
			expect(() => check(options)).toThrow(/^limixGuard\(\)/);
		}
	});

	test('a static policy with relations needs a checker', () => {
		expect(() => check({ ...base(), policy: withRelations })).toThrow(
			/use relations/,
		);
		expect(() =>
			check({ ...base(), policy: withRelations, relations: () => ({}) }),
		).not.toThrow();
	});

	test('a source with relations is left to the core', () => {
		expect(() =>
			check({ ...base(), policy: mutableSource(withRelations) }),
		).not.toThrow();
	});
});
