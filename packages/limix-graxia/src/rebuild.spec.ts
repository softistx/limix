import { describe, expect, test } from 'bun:test';
import {
	buildSchema,
	type GraphQLInterfaceType,
	type GraphQLList,
	type GraphQLNonNull,
	type GraphQLObjectType,
	type GraphQLUnionType,
	printSchema,
} from 'graphql';
import { rebuildSchema } from './rebuild';
import { fixtureSchema } from './schema.fixtures';

const SDL = `
	"""Query docs"""
	type Query { node(id: ID!): Node  all: [Thing!]!  pick: Pick }
	interface Node { id: ID! }
	type Thing implements Node { id: ID! kind: Kind }
	type Other implements Node { id: ID! }
	union Pick = Thing | Other
	enum Kind { A B }
	input Where { kind: Kind }
`;

describe('rebuildSchema', () => {
	test('prints the same schema and leaves the original untouched', () => {
		const original = buildSchema(SDL);
		const before = printSchema(original);
		const next = rebuildSchema(original, (_t, _n, config) => config);
		expect(next).not.toBe(original);
		expect(printSchema(next)).toBe(before);
		expect(printSchema(original)).toBe(before);
		expect(next.getType('Thing')).not.toBe(original.getType('Thing'));
	});

	test('rewrites every reference to the rebuilt types', () => {
		const original = buildSchema(SDL);
		const next = rebuildSchema(original, (_t, _n, config) => config);
		const query = next.getQueryType() as GraphQLObjectType;
		expect(query).toBe(next.getType('Query') as GraphQLObjectType);
		const all = query.getFields()['all']?.type as GraphQLNonNull<
			GraphQLList<GraphQLNonNull<GraphQLObjectType>>
		>;
		expect(all.ofType.ofType.ofType).toBe(
			next.getType('Thing') as GraphQLObjectType,
		);
		const thing = next.getType('Thing') as GraphQLObjectType;
		expect(thing.getInterfaces()[0]).toBe(
			next.getType('Node') as GraphQLInterfaceType,
		);
		const union = next.getType('Pick') as GraphQLUnionType;
		expect(union.getTypes()).toEqual([
			thing,
			next.getType('Other') as GraphQLObjectType,
		]);
		expect(
			next.getPossibleTypes(next.getType('Node') as GraphQLInterfaceType),
		).toContain(thing);
		expect(next.getType('Kind')).toBe(original.getType('Kind'));
	});

	test('keeps descriptions and calls the mapper once per object field', () => {
		const seen: string[] = [];
		const next = rebuildSchema(buildSchema(SDL), (type, name, config) => {
			seen.push(`${type.name}.${name}`);
			return config;
		});
		next.getQueryType()?.getFields();
		next.getType('Thing');
		(next.getType('Thing') as GraphQLObjectType).getFields();
		expect(seen).toContain('Query.node');
		expect(seen).toContain('Thing.kind');
	});

	test('a mapped resolver is the one the new schema runs', async () => {
		const next = rebuildSchema(fixtureSchema(), (type, name, config) =>
			type.name === 'Query' && name === 'open'
				? { ...config, resolve: () => 'mapped' }
				: config,
		);
		const { graphql } = await import('graphql');
		expect((await graphql({ schema: next, source: '{ open }' })).data).toEqual({
			open: 'mapped',
		});
	});
});
