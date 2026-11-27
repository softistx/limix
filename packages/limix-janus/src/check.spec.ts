import { describe, expect, test } from 'bun:test';
import { defineModel, fromField } from '@softistx/janus/permissions';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { checkModel } from './check';
import { model, policy } from './janus.fixtures';

const term = (relation: string, type: string) => ({
	require: [[{ relation, type }]],
});

describe('checkModel', () => {
	test('is empty when every term is in the model', () => {
		expect(checkModel(policy, model)).toEqual([]);
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
		const issues = checkModel(bad, model);
		expect(issues.map((issue) => issue.path)).toEqual([
			"rest['/files/:id'].GET.relations[0].require[0][0]",
			"rest['/files/:id'].DELETE.relations[1].require[0][0]",
			'graphql.Mutation.drop.relations[0].require[0][0]',
		]);
		expect(issues.map((issue) => issue.kind)).toEqual([
			'unknown-type',
			'unknown-relation',
			'unknown-relation',
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
		expect(checkModel(ok, model)).toEqual([]);
	});

	test('REST paths use the rules-file pattern, without global.basePath', () => {
		const bad = compilePolicy(
			definePolicy({
				limix: 1,
				global: { basePath: '/api', unmatched: 'deny' },
				rest: { '/files/:id': { GET: { relations: [term('view', 'file')] } } },
			}),
		);
		expect(checkModel(bad, model).map((i) => i.path)).toEqual([
			"rest['/files/:id'].GET.relations[0].require[0][0]",
		]);
	});

	test('reports a fromField relation as not supported', () => {
		const withField = defineModel({
			subjects: ['staff'],
			types: {
				record: {
					related: { doctors: fromField('doctorId', 'staff') },
					permits: { read: ['doctors'] },
				},
			},
		});
		const rules = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'/records/:id': {
						GET: { relations: [term('doctors', 'record')] },
						PUT: { relations: [term('read', 'record')] },
					},
				},
			}),
		);
		const issues = checkModel(rules, withField);
		expect(issues).toHaveLength(1);
		expect(issues[0]?.path).toBe(
			"rest['/records/:id'].GET.relations[0].require[0][0]",
		);
		expect(issues[0]?.kind).toBe('from-field');
		expect(issues[0]?.message).toContain('not supported');
		expect(issues[0]?.message).toContain('`load` option on the roadmap');
	});
});
