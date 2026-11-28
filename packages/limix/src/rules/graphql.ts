import { z } from 'zod';
import { strict } from './hints';
import { flatKeyHint, NOT_FLAT_GRAPHQL_KEY } from './keys';
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
		.describe(
			'Field name on this GraphQL type, e.g. "createUser", or `*` for every other field.',
		),
	zGraphqlRule,
);

/**
 * GraphQL rules: a type name, then the rules by field name (`*` for every
 * other field). Any type name is accepted, the root types `Query`, `Mutation`
 * and `Subscription` included, to guard fields of returned types. A flat key
 * (`Query.me`) is a `definePolicy` spelling and is refused here with the
 * nested one to write.
 */
export const zGraphqlRules = z
	.record(
		z
			.string()
			.regex(NOT_FLAT_GRAPHQL_KEY, {
				error: (issue) => flatKeyHint('graphql', String(issue.input)),
			})
			.describe(
				'Type name: Query, Mutation or Subscription for root fields, any other name for fields of that type wherever it appears.',
			),
		zFields,
	)
	.describe(
		'GraphQL rules, keyed by type name then field name (`*` for every other ' +
			'field of the type). Query, Mutation and Subscription cover root ' +
			'fields; any other type name targets fields on that type wherever it ' +
			'appears.',
	) as unknown as z.ZodType<NonNullable<Rules['graphql']>>;
