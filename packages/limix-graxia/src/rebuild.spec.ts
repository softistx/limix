import { describe, expect, test } from 'bun:test';
import {
	buildSchema,
	type GraphQLInterfaceType,
	type GraphQLList,
	type GraphQLNonNull,
	GraphQLObjectType,
	GraphQLSchema,
	GraphQLString,
	type GraphQLUnionType,
	printSchema,
	validateSchema,
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

	test('keeps descriptions and calls the mapper exactly once per object field', () => {
		const seen: string[] = [];
		const next = rebuildSchema(buildSchema(SDL), (type, name, config) => {
			seen.push(`${type.name}.${name}`);
			return config;
		});
		for (const type of Object.values(next.getTypeMap())) {
			if (type instanceof GraphQLObjectType) {
				type.getFields();
				type.getFields();
			}
		}
		expect(seen.sort()).toEqual([
			'Other.id',
			'Query.all',
			'Query.node',
			'Query.pick',
			'Thing.id',
			'Thing.kind',
		]);
		expect(next.getQueryType()?.description).toBe('Query docs');
	});

	test('the rebuilt schema is valid', () => {
		const next = rebuildSchema(buildSchema(SDL), (_t, _n, config) => config);
		expect(validateSchema(next)).toEqual([]);
	});

	test('an interface implementing an interface survives', () => {
		const sdl = `
			interface Node { id: ID }
			interface Entity implements Node { id: ID  name: String }
			type User implements Entity & Node { id: ID  name: String }
			type Query { entity: Entity }
		`;
		const next = rebuildSchema(buildSchema(sdl), (_t, _n, config) => config);
		const entity = next.getType('Entity') as GraphQLInterfaceType;
		const node = next.getType('Node') as GraphQLInterfaceType;
		expect(entity.getInterfaces()).toEqual([node]);
		expect((next.getType('User') as GraphQLObjectType).getInterfaces()).toEqual(
			[entity, node],
		);
		expect(next.getPossibleTypes(entity)).toEqual([
			next.getType('User') as GraphQLObjectType,
		]);
		expect(validateSchema(next)).toEqual([]);
		expect(printSchema(next)).toBe(printSchema(buildSchema(sdl)));
	});

	test('repeatable directives on a field are kept', () => {
		const sdl = `
			directive @tag(name: String) repeatable on FIELD_DEFINITION
			type Query { a: String @tag(name: "x") @tag(name: "y") }
		`;
		const next = rebuildSchema(buildSchema(sdl), (_t, _n, config) => config);
		const field = next.getQueryType()?.getFields()['a'];
		expect(field?.astNode?.directives?.map((d) => d.name.value)).toEqual([
			'tag',
			'tag',
		]);
		expect(next.getDirective('tag')?.isRepeatable).toBe(true);
	});

	test('extensions of types and fields are kept', () => {
		const query = new GraphQLObjectType({
			name: 'Query',
			extensions: { onType: 1 },
			fields: { a: { type: GraphQLString, extensions: { onField: 2 } } },
		});
		const next = rebuildSchema(
			new GraphQLSchema({ query, extensions: { onSchema: 3 } }),
			(_t, _n, config) => config,
		);
		expect(next.getQueryType()?.extensions).toEqual({ onType: 1 });
		expect(next.getQueryType()?.getFields()['a']?.extensions).toEqual({
			onField: 2,
		});
		expect(next.extensions).toEqual({ onSchema: 3 });
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
