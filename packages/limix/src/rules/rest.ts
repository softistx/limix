import { z } from 'zod';
import { strict } from './hints';
import {
	BAD_KEY,
	FLAT_REST_KEY,
	MALFORMED_REST_KEY,
	NESTED_REST_KEY,
} from './keys';
import { entryShape, zRestRelationRung } from './terms';
import type { Rules } from './types';

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
const RULE_TERM_HINTS = Object.fromEntries(
	[...Object.keys(entryShape), 'relations'].map((term) => [
		term,
		'a term of a rule, not a method: write "GET /x": {...} or nest it under a method',
	]),
);

export const zMethods = strict(
	{
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
		'*': zRestRule
			.optional()
			.describe(
				'Any method. A method written beside it wins on the same pattern.',
			),
	},
	RULE_TERM_HINTS,
).describe('Rules keyed by HTTP method for this path pattern.');

/**
 * Flat keys (`"POST /users/:id": { ... }`) and nested ones (`"/users/:id": {
 * POST: { ... } }`) side by side. A key goes to exactly one of the three
 * records by its shape, and the others let it through unchanged, so the
 * document order survives the intersection.
 */
// The intersection merges what each side returns, key by key, and relies on
// every side returning a rule unchanged: a rule schema (here or in `terms.ts`)
// must never carry a transform, a default or a preprocess, or the merge fails
// on an unmergeable value. `flat-keys.spec.ts` parses both spellings together,
// which fails on one.
// The intersection of records infers a type no document has; the explicit
// `Rules['rest']` is what the schema accepts, and `types.spec.ts` holds the
// rule and method shapes to it.
export const zRestRules = z
	.intersection(
		z.intersection(
			z.looseRecord(
				z
					.string()
					.regex(FLAT_REST_KEY)
					.describe(
						'A method (or `*`), one space, then the path pattern: "POST /users/:id".',
					),
				zRestRule,
			),
			z.looseRecord(
				z
					.string()
					.regex(NESTED_REST_KEY)
					.describe(
						'Path pattern: `:name` for one segment, `*name` or `*` for the rest, `{...}` optional, e.g. "/users/:id".',
					),
				zMethods,
			),
		),
		z.looseRecord(
			z.string().regex(MALFORMED_REST_KEY),
			z.never({ error: BAD_KEY }),
		),
	)
	.describe(
		'REST rules, keyed by `METHOD /pattern` or by path pattern then HTTP ' +
			'method. The first rule whose pattern matches the request path, in ' +
			'document order, is used.',
	) as unknown as z.ZodType<NonNullable<Rules['rest']>>;
