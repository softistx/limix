import { describe, expect, test } from 'bun:test';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { checkRulesAgainstModel } from './check';
import { model, policy } from './fixtures';

const term = (relation: string, type: string) => ({
	require: [[{ relation, type }]],
});

describe('checkRulesAgainstModel', () => {
	test('is empty when every term is in the model', () => {
		expect(checkRulesAgainstModel(policy, model)).toEqual([]);
	});

	test('reports an unknown type and an unknown relation, with paths', () => {
		const bad = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'/files/:id': {
						GET: { relations: [term('view', 'file')] },
						DELETE: {
							relations: [term('view', 'document'), term('purge', 'document')],
						},
					},
				},
				graphql: {
					Mutation: { drop: { relations: [term('viewrs', 'document')] } },
				},
			}),
		);
		const issues = checkRulesAgainstModel(bad, model);
		expect(issues.map((issue) => issue.path)).toEqual([
			"rest['/files/:id'].GET.relations[0].require[0][0]",
			"rest['/files/:id'].DELETE.relations[1].require[0][0]",
			'graphql.Mutation.drop.relations[0].require[0][0]',
		]);
		expect(issues[0]?.message).toContain('type `file` is not a type');
		expect(issues[1]?.message).toContain('`purge` is neither a relation');
		expect(issues[2]?.message).toContain('`viewrs`');
	});

	test('accepts a relation and a permission, and ignores rules without relations', () => {
		const ok = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'/a': { GET: { public: true } },
					'/b/:id': { GET: { relations: [term('viewers', 'document')] } },
				},
			}),
		);
		expect(checkRulesAgainstModel(ok, model)).toEqual([]);
	});
});
