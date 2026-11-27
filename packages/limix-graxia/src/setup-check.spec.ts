import { describe, expect, test } from 'bun:test';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { buildSchema } from 'graphql';
import { fixtureSchema, policy } from './schema.fixtures';
import { checkPolicy } from './setup-check';

const compile = (graphql: Record<string, Record<string, object>>) =>
	compilePolicy(
		definePolicy({ limix: 1, global: { unmatched: 'deny' }, graphql } as never),
	);

describe('checkPolicy', () => {
	test('passes the fixture policy on the fixture schema', () => {
		expect(() => checkPolicy(policy, fixtureSchema(), 'refuse')).not.toThrow();
	});

	test('lists an unknown type, a non-object type and an unknown field together', () => {
		const schema = buildSchema(
			'type Query { a: String } interface Node { id: ID } enum E { X }',
		);
		const bad = compile({
			Nope: { a: { public: true } },
			Node: { id: { public: true } },
			E: { X: { public: true } },
			Query: { missing: { public: true } },
		});
		expect(() => checkPolicy(bad, schema, 'refuse')).toThrow(
			/Nope: the schema has no such type[\s\S]*Node: rules go on object types[\s\S]*E: rules go on object types[\s\S]*Query\.missing: the type has no such field/,
		);
	});

	test('a field called constructor is not found through the prototype', () => {
		const schema = buildSchema('type Query { a: String }');
		const bad = compile({ Query: { constructor: { public: true } } });
		expect(() => checkPolicy(bad, schema, 'refuse')).toThrow('no such field');
	});

	test('refuses a named non-null field unless nonNull is allow', () => {
		const schema = buildSchema('type Query { a: String! }');
		const named = compile({ Query: { a: { public: true } } });
		expect(() => checkPolicy(named, schema, 'refuse')).toThrow(
			'is non-null, so a refusal would null its parent',
		);
		expect(() => checkPolicy(named, schema, 'allow')).not.toThrow();
	});

	test('refuses a subscription rule that reads source', () => {
		const schema = buildSchema(
			'type Query { a: String } type Subscription { s(id: ID): String }',
		);
		const rung = (from: string) => ({
			relations: [{ require: [[{ relation: 'view', type: 'note', from }]] }],
		});
		expect(() =>
			checkPolicy(
				compile({ Subscription: { s: rung('source.id') } }),
				schema,
				'refuse',
			),
		).toThrow('starts with no `source`');
		expect(() =>
			checkPolicy(
				compile({ Subscription: { s: rung('args.id') } }),
				schema,
				'refuse',
			),
		).not.toThrow();
	});
});
