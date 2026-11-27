import type { GraphqlOperation } from '@softistx/limix/coverage';
import {
	type GraphQLSchema,
	isIntrospectionType,
	isObjectType,
	isSchema,
} from 'graphql';
import { rootNames } from '../governs';
import { operationsFromSdl } from './sdl';

export interface GraphqlOperationsOptions {
	/**
	 * `'roots'` (default): the fields of the Query, Mutation and Subscription
	 * types. `'all'` adds the fields of every other object type, with `root: false`.
	 */
	fields?: 'roots' | 'all';
}

function fromSchema(
	schema: GraphQLSchema,
	fields: 'roots' | 'all',
): GraphqlOperation[] {
	const roots = [...rootNames(schema)];
	const names =
		fields === 'all'
			? [
					...roots,
					...Object.values(schema.getTypeMap())
						.filter(
							(type) =>
								isObjectType(type) &&
								!isIntrospectionType(type) &&
								!roots.includes(type.name),
						)
						.map((type) => type.name),
				]
			: roots;
	return names.flatMap((name) => {
		const type = schema.getType(name);
		return isObjectType(type)
			? Object.keys(type.getFields()).map(
					(field): GraphqlOperation => ({
						kind: 'graphql',
						type: name,
						field,
						root: roots.includes(name),
					}),
				)
			: [];
	});
}

/**
 * The GraphQL operations of a schema (built, or SDL text read without building
 * it), in the shape `coverage(policy, operations)` of `@softistx/limix/coverage`
 * takes. A renamed root keeps its real name and has `root: true`.
 */
export function graphqlOperations(
	source: GraphQLSchema | string,
	options: GraphqlOperationsOptions = {},
): GraphqlOperation[] {
	const fields = options.fields ?? 'roots';
	return isSchema(source)
		? fromSchema(source, fields)
		: operationsFromSdl(source, fields);
}
