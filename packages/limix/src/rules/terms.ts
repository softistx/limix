import { z } from 'zod';
import { RELATION_TERM_HINTS, ROLE_DOMAIN_HINT, strict } from './hints';

/**
 * A list of alternatives in disjunctive normal form: the OUTER list is OR, each
 * INNER list is AND. `[['a'], ['b', 'c']]` reads "a, or b and c". An empty
 * list, or an empty alternative, is refused: neither can sensibly admit anyone.
 */
export const zAlternatives = z.array(z.array(z.string().min(1)).min(1)).min(1);

const zRoleName = z
	.string()
	.min(1)
	.refine((role) => !role.includes('$'), { message: ROLE_DOMAIN_HINT });

export const zRoles = z
	.array(z.array(zRoleName).min(1))
	.min(1)
	.describe(
		'Roles in disjunctive normal form: the OUTER list is OR, the INNER list is ' +
			'AND, so [["admin"], ["editor", "reviewer"]] reads "admin, or editor and ' +
			'reviewer". A role holds when it is in claims.roles.',
	);

export const zPermissions = zAlternatives.describe(
	'Permissions in disjunctive normal form: the OUTER list is OR, the INNER ' +
		'list is AND, so [["a"], ["b", "c"]] reads "a, or b and c". A permission ' +
		'holds when it is in claims.scope (space separated) and, when the caller ' +
		'carries a claims.permissions list, also in that list.',
);

export const zWhen = z
	.array(z.string().min(1))
	.min(1)
	.describe(
		'Names of conditions registered in code (compilePolicy({ conditions })). ' +
			'Every named condition must hold. An unknown name fails at compile time.',
	);

const DENIALS = ['NOT_FOUND', 'FORBIDDEN'] as const;

/** Where a relation term reads the object id from when it names no `from`. */
export const DEFAULT_FROM = {
	rest: 'param.id',
	graphql: 'args.id',
} as const;

/** How a failed relations rung is answered when it names no `onDeny`. */
export const DEFAULT_ON_DENY = 'NOT_FOUND' as const;

/** One relation term: the caller must hold `relation` on an object of `type`. */
function relationTerm(
	idPattern: RegExp,
	idHelp: string,
	idExamples: string[],
	defaultFrom: string,
) {
	return strict(
		{
			relation: z
				.string()
				.min(1)
				.describe('The relation the caller must hold, e.g. "view" or "edit".'),
			type: z
				.string()
				.min(1)
				.describe('The type of the object, e.g. "bookmark".'),
			from: z
				.string()
				.regex(idPattern, { message: `\`from\` must be ${idHelp}` })
				.optional()
				.describe(
					`Where the object id is read from: ${idHelp} (dotted). A path ` +
						'resolving to a list requires the relation on every element. ' +
						`Defaults to "${defaultFrom}".`,
				)
				.meta({ examples: idExamples }),
		},
		RELATION_TERM_HINTS,
	);
}

/** One rung of the relations ladder, built per transport: only the `from` grammar differs. */
function relationRung(
	idPattern: RegExp,
	idHelp: string,
	idExamples: string[],
	defaultFrom: string,
) {
	return strict({
		require: z
			.array(
				z
					.array(relationTerm(idPattern, idHelp, idExamples, defaultFrom))
					.min(1),
			)
			.min(1)
			.describe(
				'Requirement in disjunctive normal form: the OUTER list is OR, the ' +
					'INNER list is AND, so [[A, B], [C]] reads "(A and B) or C".',
			),
		onDeny: z
			.enum(DENIALS)
			.optional()
			.describe(
				`How a failure of this rung is answered. ${DEFAULT_ON_DENY} (the default) is ` +
					'the same answer as for an id that never existed; FORBIDDEN is for ' +
					'a second rung on an object the caller can already see.',
			),
		message: z.string().optional().describe('The i18n key the denial carries.'),
	});
}

export const zRestRelationRung = relationRung(
	/^(param|query|json)(\.[A-Za-z0-9_]+)+$/,
	'"param.<name>", "query.<name>" or "json.<path>"',
	['param.id', 'query.projectId', 'json.bookmarkId'],
	DEFAULT_FROM.rest,
);

export const zGraphqlRelationRung = relationRung(
	/^(args|source)(\.[A-Za-z0-9_]+)+$/,
	'"args.<path>" or "source.<path>"',
	['args.id', 'args.input.noteId', 'source.id'],
	DEFAULT_FROM.graphql,
);

/** The keys every rule carries, REST or GraphQL. */
export const entryShape = {
	roles: zRoles.nullish(),
	permissions: zPermissions.nullish(),
	when: zWhen.nullish(),
	authenticated: z
		.boolean()
		.nullish()
		.describe(
			'Declares that the rule needs a signed-in caller and nothing more. ' +
				'Cannot be combined with `public: true`.',
		),
	public: z
		.boolean()
		.nullish()
		.describe(
			'Lets anonymous callers reach the rule. Only for routes that carry ' +
				'their own credential. Cannot be combined with `authenticated: true` ' +
				'`roles`, `permissions`, `when` or `relations`.',
		),
};
