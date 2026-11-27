import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { policy, whoOf, withRelations } from './app.fixtures';
import { limixGuard } from './guard';

const badRung = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/n/:id': {
				GET: {
					relations: [
						{
							code: 'app.errors.nope',
							require: [[{ relation: 'v', type: 'note', from: 'param.id' }]],
						},
					],
				},
			},
		},
	}),
);

describe('limixGuard, setup', () => {
	test('wrong options throw naming limixGuard()', () => {
		const app = alxia();
		expect(() => limixGuard({ policy, app } as never)).toThrow(
			/^limixGuard\(\): pass `claims`/,
		);
		expect(() => limixGuard({ policy, claims: whoOf } as never)).toThrow(
			/pass `app`/,
		);
	});

	test('rules with relations and no checker throw at setup', () => {
		expect(() =>
			limixGuard({ policy: withRelations, claims: whoOf, app: alxia() }),
		).toThrow(/use relations/);
	});

	test('a rung code outside auth.errors. throws at setup', () => {
		expect(() =>
			limixGuard({
				policy: badRung,
				claims: whoOf,
				app: alxia(),
				relations: { check: async (q) => q.map(() => true) },
			}),
		).toThrow(/outside `auth\.errors\.`/);
	});

	test('a second guard on the same app throws, one on a group does not', () => {
		const app = alxia();
		limixGuard({ policy, claims: whoOf, app });
		expect(() => limixGuard({ policy, claims: whoOf, app })).toThrow(
			/already has a limix guard/,
		);
		app.group('/g', (g) => {
			expect(() => limixGuard({ policy, claims: whoOf, app: g })).not.toThrow();
			return g;
		});
	});

	test('given uncalled, alxia refuses it at declaration', () => {
		expect(() => alxia().use(limixGuard as never)).toThrow(/factory/);
	});
});
