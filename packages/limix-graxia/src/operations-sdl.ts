import type { GraphqlOperation } from '@softistx/limix/coverage';
import {
	type DefinitionNode,
	type FieldDefinitionNode,
	Kind,
	parse,
} from 'graphql';

const KINDS = ['query', 'mutation', 'subscription'] as const;
type RootKind = (typeof KINDS)[number];

const DEFAULT_ROOTS: Record<RootKind, string> = {
	query: 'Query',
	mutation: 'Mutation',
	subscription: 'Subscription',
};

/** Root type names: the `schema { ... }` block's when there is one, else the conventional ones. */
function rootNames(
	definitions: readonly DefinitionNode[],
): Record<RootKind, string> {
	const names = { ...DEFAULT_ROOTS };
	for (const definition of definitions) {
		if (
			definition.kind === Kind.SCHEMA_DEFINITION ||
			definition.kind === Kind.SCHEMA_EXTENSION
		) {
			for (const { operation, type } of definition.operationTypes ?? []) {
				names[operation] = type.name.value;
			}
		}
	}
	return names;
}

/** Every field each object type declares, merged over `extend type`, by type in first-appearance order. */
function fieldsByType(
	definitions: readonly DefinitionNode[],
): Map<string, string[]> {
	const types = new Map<string, string[]>();
	for (const definition of definitions) {
		if (
			definition.kind !== Kind.OBJECT_TYPE_DEFINITION &&
			definition.kind !== Kind.OBJECT_TYPE_EXTENSION
		) {
			continue;
		}
		const names = types.get(definition.name.value) ?? [];
		types.set(definition.name.value, names);
		for (const field of (definition.fields ?? []) as FieldDefinitionNode[]) {
			if (!names.includes(field.name.value)) names.push(field.name.value);
		}
	}
	return types;
}

/**
 * The operations an SDL document declares, read from its syntax tree and never
 * built, so directives and types defined elsewhere do not matter. Roots come
 * first in query, mutation, subscription order, then (with `fields: 'all'`)
 * every other object type with `root: false`.
 */
export function operationsFromSdl(
	sdl: string,
	fields: 'roots' | 'all',
): GraphqlOperation[] {
	const { definitions } = parse(sdl, { noLocation: true });
	const names = rootNames(definitions);
	const types = fieldsByType(definitions);
	const roots = [...new Set(KINDS.map((kind) => names[kind]))];
	const of = (type: string, root: boolean): GraphqlOperation[] =>
		(types.get(type) ?? []).map((field) => ({
			kind: 'graphql',
			type,
			field,
			root,
		}));
	return [
		...roots.flatMap((type) => of(type, true)),
		...(fields === 'all'
			? [...types.keys()]
					.filter((type) => !roots.includes(type))
					.flatMap((type) => of(type, false))
			: []),
	];
}
