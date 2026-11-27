import {
	type GraphQLFieldConfig,
	GraphQLInterfaceType,
	GraphQLList,
	type GraphQLNamedType,
	GraphQLNonNull,
	GraphQLObjectType,
	type GraphQLOutputType,
	GraphQLSchema,
	GraphQLUnionType,
} from 'graphql';

type FieldMap = Record<string, GraphQLFieldConfig<unknown, unknown>>;

/** Changes a field of an object type; return `config` itself to leave it. */
export type MapField = (
	type: GraphQLObjectType,
	name: string,
	config: GraphQLFieldConfig<unknown, unknown>,
) => GraphQLFieldConfig<unknown, unknown>;

/**
 * A copy of the schema whose object fields went through `mapField`. The
 * caller's schema is never mutated: object, interface and union types are
 * rebuilt (their references to one another rewritten); scalars, enums and
 * input types, which refer to no rebuilt type, are shared.
 */
export function rebuildSchema(
	schema: GraphQLSchema,
	mapField: MapField,
): GraphQLSchema {
	const config = schema.toConfig();
	const built = new Map<string, GraphQLNamedType>();
	const swap = <T extends GraphQLOutputType>(type: T): T => {
		if (type instanceof GraphQLNonNull) {
			return new GraphQLNonNull(swap(type.ofType)) as unknown as T;
		}
		if (type instanceof GraphQLList) {
			return new GraphQLList(swap(type.ofType)) as unknown as T;
		}
		return (built.get((type as GraphQLNamedType).name) ?? type) as T;
	};
	const fieldsOf =
		(
			fields: FieldMap,
			each?: (name: string, field: FieldMap[string]) => FieldMap[string],
		) =>
		(): FieldMap =>
			Object.fromEntries(
				Object.entries(fields).map(([name, field]) => [
					name,
					{ ...(each?.(name, field) ?? field), type: swap(field.type) },
				]),
			);
	const interfacesOf = (names: readonly GraphQLInterfaceType[]) => () =>
		names.map((i) => built.get(i.name) as GraphQLInterfaceType);

	for (const type of config.types) {
		if (type.name.startsWith('__')) continue;
		if (type instanceof GraphQLObjectType) {
			const own = type.toConfig();
			const object: GraphQLObjectType = new GraphQLObjectType({
				...own,
				interfaces: interfacesOf(own.interfaces),
				fields: fieldsOf(own.fields as FieldMap, (name, field) =>
					mapField(object, name, field),
				),
			});
			built.set(type.name, object);
		} else if (type instanceof GraphQLInterfaceType) {
			const own = type.toConfig();
			built.set(
				type.name,
				new GraphQLInterfaceType({
					...own,
					interfaces: interfacesOf(own.interfaces),
					fields: fieldsOf(own.fields as FieldMap),
				}),
			);
		} else if (type instanceof GraphQLUnionType) {
			const own = type.toConfig();
			built.set(
				type.name,
				new GraphQLUnionType({
					...own,
					types: () =>
						own.types.map((t) => built.get(t.name) as GraphQLObjectType),
				}),
			);
		}
	}
	const named = <T extends GraphQLNamedType>(type: T | null | undefined) =>
		type ? ((built.get(type.name) as T | undefined) ?? type) : type;
	return new GraphQLSchema({
		...config,
		query: named(config.query),
		mutation: named(config.mutation),
		subscription: named(config.subscription),
		types: config.types
			.filter((type) => !type.name.startsWith('__'))
			.map((type) => built.get(type.name) ?? type),
	});
}
