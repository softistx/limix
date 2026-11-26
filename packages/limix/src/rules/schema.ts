import { z } from 'zod';
import { zGraphqlRules } from './graphql';
import { unknownKeysMessage } from './hints';
import { zRestRules } from './rest';

export const LIMIX_FORMAT_VERSION = 1 as const;

const zGlobal = z.strictObject(
	{
		basePath: z
			.string()
			.optional()
			.describe('Prefix prepended to every REST path pattern, e.g. "/api".'),
		unmatched: z
			.enum(['allow', 'deny'])
			.describe(
				'What a REST request, or a GraphQL root field, that no rule names is ' +
					'answered. "allow" lets it through; "deny" makes the file the ' +
					'exhaustive statement of what the service exposes: an unnamed path is ' +
					'refused, 401 for an anonymous caller and 403 otherwise. Required, so ' +
					'that leaving a door open is a decision written down.',
			),
	},
	{
		error: (issue) =>
			issue.code === 'unrecognized_keys'
				? unknownKeysMessage(issue.keys)
				: undefined,
	},
);

const zDocument = z.strictObject(
	{
		limix: z
			.literal(LIMIX_FORMAT_VERSION)
			.describe('The version of the rules format. Always 1.'),
		global: zGlobal.describe('Settings applied across the whole document.'),
		rest: zRestRules.optional(),
		graphql: zGraphqlRules.optional(),
	},
	{
		error: (issue) =>
			issue.code === 'unrecognized_keys'
				? unknownKeysMessage(issue.keys)
				: undefined,
	},
);

/**
 * Drops the `x-` keys of a raw document. They exist for YAML anchors
 * (`x-common: &admin ...`), already resolved by the time the document gets
 * here, so nothing downstream reads them.
 */
function stripExtensionKeys(raw: unknown): unknown {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return raw;
	return Object.fromEntries(
		Object.entries(raw).filter(([key]) => !key.startsWith('x-')),
	);
}

export const RulesSchema = z
	.preprocess(stripExtensionKeys, zDocument)
	.describe(
		'A limix rules document: REST and/or GraphQL access rules. Unknown ' +
			'top-level keys are rejected; keys starting with `x-` are accepted for ' +
			'YAML anchors and dropped.',
	);

/** A validated rules document, as `parseRules` and `definePolicy` return it. */
export type Rules = z.infer<typeof RulesSchema>;
