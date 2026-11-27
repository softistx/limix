import type { CompiledGraphqlEntry, CompiledPolicy } from '../rules';

const hasOwn = (value: object | undefined, key: string) =>
	value !== undefined && Object.hasOwn(value, key);

/**
 * The compiled rule on `type.field`, if any: the field's own, else the type's
 * `Type.*`. Own keys only: a field named `constructor` or `toString` is not a
 * rule.
 */
export function graphqlEntry(
	policy: CompiledPolicy,
	type: string,
	field: string,
): CompiledGraphqlEntry | undefined {
	const fields = hasOwn(policy.graphql, type)
		? policy.graphql?.[type]
		: undefined;
	if (hasOwn(fields, field)) return fields?.[field];
	return hasOwn(fields, '*') ? fields?.['*'] : undefined;
}
