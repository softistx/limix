import type { CompiledGraphqlEntry, CompiledPolicy } from '@softistx/limix';
import type { GraphQLSchema } from 'graphql';

/**
 * The compiled rule on `type.field`: the field's own, else the type's `Type.*`
 * (without that fallback a `Note.*` field would go unguarded). Own keys only,
 * so a field named `constructor` is not a rule.
 */
export function entryOf(
	policy: CompiledPolicy,
	type: string,
	field: string,
): CompiledGraphqlEntry | undefined {
	const { graphql } = policy;
	if (!graphql || !Object.hasOwn(graphql, type)) return undefined;
	const fields = graphql[type];
	if (!fields) return undefined;
	if (Object.hasOwn(fields, field)) return fields[field];
	return Object.hasOwn(fields, '*') ? fields['*'] : undefined;
}

/** Whether the policy decides this field: a rule names it, or it is a root field under `unmatched: deny`. */
export function governs(
	policy: CompiledPolicy,
	type: string,
	field: string,
	root: boolean,
): boolean {
	return (
		entryOf(policy, type, field) !== undefined ||
		(root && policy.global.unmatched === 'deny')
	);
}

/** The names of the schema's operation root types, whatever they are called. */
export function rootNames(schema: GraphQLSchema): Set<string> {
	return new Set(
		[
			schema.getQueryType(),
			schema.getMutationType(),
			schema.getSubscriptionType(),
		].flatMap((type) => (type ? [type.name] : [])),
	);
}
