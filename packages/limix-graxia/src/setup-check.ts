import type { CompiledPolicy } from '@softistx/limix';
import { GraphQLNonNull, GraphQLObjectType, type GraphQLSchema } from 'graphql';
import { entryOf } from './governs';

const readsSource = (policy: CompiledPolicy, type: string, field: string) =>
	entryOf(policy, type, field)?.rule.relations?.some((rung) =>
		rung.require.some((all) =>
			all.some((term) => term.from?.startsWith('source.')),
		),
	) === true;

/**
 * What a static policy cannot get right against this schema, before any request:
 * a rule on an unknown or non-object type or an unknown field, a non-null named
 * field (a refusal would null its parent) and a subscription rule reading `source.`
 * (a subscription starts with no source). Throws one TypeError listing them all.
 */
export function checkPolicy(
	policy: CompiledPolicy,
	schema: GraphQLSchema,
	nonNull: 'refuse' | 'allow',
): void {
	const problems: string[] = [];
	const subscription = schema.getSubscriptionType()?.name;
	for (const [typeName, rules] of Object.entries(policy.graphql ?? {})) {
		const type = schema.getType(typeName);
		if (!type) {
			problems.push(`${typeName}: the schema has no such type`);
			continue;
		}
		if (!(type instanceof GraphQLObjectType)) {
			problems.push(`${typeName}: rules go on object types, this one is not`);
			continue;
		}
		const fields = type.getFields();
		for (const field of Object.keys(rules)) {
			const found = Object.hasOwn(fields, field) ? fields[field] : undefined;
			if (!found) {
				problems.push(`${typeName}.${field}: the type has no such field`);
			} else if (nonNull === 'refuse' && found.type instanceof GraphQLNonNull) {
				problems.push(
					`${typeName}.${field}: is non-null, so a refusal would null its parent; make it nullable, or pass \`nonNull: 'allow'\``,
				);
			}
			if (typeName === subscription && readsSource(policy, typeName, field)) {
				problems.push(
					`${typeName}.${field}: a subscription starts with no \`source\`, so a relation reading \`source.\` fails at subscribe; read \`args.\``,
				);
			}
		}
	}
	if (problems.length > 0) {
		throw new TypeError(
			`guardSchema(): the policy does not fit the schema:\n- ${problems.join('\n- ')}`,
		);
	}
}
