import { z } from 'zod';
import { strict } from './hints';
import { entryShape, zRestRelationRung } from './terms';

export const zRestRule = strict({
	...entryShape,
	relations: z
		.array(zRestRelationRung)
		.min(1)
		.optional()
		.describe(
			'Per-object relation checks, one rung after the other: the first that ' +
				'fails denies, which is how the 404-then-403 ladder is written.',
		),
});

/**
 * The HTTP methods a path entry may name, as explicit properties (so editors
 * suggest them) and strict (so a typo'd method fails instead of leaving the
 * route without a rule).
 */
const zMethods = strict({
	GET: zRestRule.optional(),
	POST: zRestRule.optional(),
	PUT: zRestRule.optional(),
	PATCH: zRestRule.optional(),
	DELETE: zRestRule.optional(),
	HEAD: zRestRule.optional(),
	OPTIONS: zRestRule.optional(),
	CONNECT: zRestRule.optional(),
	TRACE: zRestRule.optional(),
	QUERY: zRestRule.optional(),
}).describe('Rules keyed by HTTP method for this path pattern.');

export const zRestRules = z
	.record(
		z
			.string()
			.describe(
				'Path pattern: `:name` for one segment, `*name` for the rest, `{...}` optional, e.g. "/users/:id".',
			),
		zMethods,
	)
	.describe(
		'REST rules, keyed by path pattern then HTTP method. The first pattern ' +
			'that matches the request path, in document order, is used.',
	);

export type RestRule = z.infer<typeof zRestRule>;
