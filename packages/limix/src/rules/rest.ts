import { z } from 'zod';
import { strict } from './hints';
import { flatKeyHint, NOT_FLAT_REST_KEY } from './keys';
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
const RULE_TERM_HINTS = Object.fromEntries(
	[...Object.keys(entryShape), 'relations'].map((term) => [
		term,
		'a term of a rule, not a method: nest it under a method (GET: {...}, or "*" for any)',
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
 * REST rules: a path pattern, then the rules by method. A flat key
 * (`"POST /users/:id"`) is a `definePolicy` spelling and is refused here with
 * the nested one to write.
 */
export const zRestRules = z
	.record(
		z
			.string()
			.regex(NOT_FLAT_REST_KEY, {
				error: (issue) => flatKeyHint('rest', String(issue.input)),
			})
			.describe(
				'Path pattern: `:name` for one segment, `*name` or `*` for the rest, `{...}` optional, e.g. "/users/:id".',
			),
		zMethods,
	)
	.describe(
		'REST rules, keyed by path pattern then HTTP method (`*` for any). The ' +
			'first rule whose pattern matches the request path, in document order, ' +
			'is used.',
	);
