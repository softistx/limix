import { z } from 'zod';
import { strict } from './hints';
import { entryShape, zGraphqlRelationRung } from './terms';

export const zGraphqlRule = strict({
	...entryShape,
	relations: z
		.array(zGraphqlRelationRung)
		.min(1)
		.optional()
		.describe(
			'Per-object relation checks, one rung after the other. Ids are read ' +
				'from `args.<path>` or `source.<path>`.',
		),
});

const zFields = z.record(
	z.string().describe('Field name on this GraphQL type, e.g. "createUser".'),
	zGraphqlRule,
);

/**
 * GraphQL rules keyed by type name then field name. The three root types are
 * explicit properties so editors suggest them; any other type name is accepted
 * through the catch-all, to guard fields of returned types.
 */
export const zGraphqlRules = z
	.object({
		Query: zFields.optional(),
		Mutation: zFields.optional(),
		Subscription: zFields.optional(),
	})
	.catchall(zFields)
	.describe(
		'GraphQL rules, keyed by type name then field name. Query, Mutation and ' +
			'Subscription cover root fields; any other type name targets fields on ' +
			'that type wherever it appears.',
	);

export type GraphqlRule = z.infer<typeof zGraphqlRule>;
