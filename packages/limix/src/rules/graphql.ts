import { z } from 'zod';
import { strict } from './hints';
import {
	BAD_KEY,
	FLAT_GRAPHQL_KEY,
	MALFORMED_GRAPHQL_KEY,
	NESTED_GRAPHQL_KEY,
} from './keys';
import { entryShape, zGraphqlRelationRung } from './terms';
import type { Rules } from './types';

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
	z
		.string()
		.describe('Field name on this GraphQL type, e.g. "createUser", or `*`.'),
	zGraphqlRule,
);

/**
 * GraphQL rules, keyed by `Type.field` / `Type.*` or by type name then field
 * name, side by side. The three root types are explicit properties so editors
 * suggest them; any other type name is accepted, to guard fields of returned
 * types. A key goes to one record by its shape and the others let it through
 * unchanged, so the document order survives the intersection (the records
 * come first: the object lists its own keys first).
 */
// Typed as `Rules['graphql']`: see `zRestRules`.
export const zGraphqlRules = z
	.intersection(
		z.intersection(
			z.intersection(
				z.looseRecord(
					z
						.string()
						.regex(FLAT_GRAPHQL_KEY)
						.describe(
							'A field of a type: "Query.me", or all of them: "Note.*".',
						),
					zGraphqlRule,
				),
				z.looseRecord(z.string().regex(NESTED_GRAPHQL_KEY), zFields),
			),
			z.looseRecord(
				z.string().regex(MALFORMED_GRAPHQL_KEY),
				z.never({ error: BAD_KEY }),
			),
		),
		z.looseObject({
			Query: zFields.optional(),
			Mutation: zFields.optional(),
			Subscription: zFields.optional(),
		}),
	)
	.describe(
		'GraphQL rules, keyed by "Type.field" or "Type.*", or by type name then ' +
			'field name. Query, Mutation and Subscription cover root fields; any ' +
			'other type name targets fields on that type wherever it appears.',
	) as unknown as z.ZodType<NonNullable<Rules['graphql']>>;
