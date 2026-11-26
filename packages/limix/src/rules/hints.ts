import { z } from 'zod';

/**
 * Keys `@softistx/security` 5 accepted and limix refuses, with what to write
 * instead. A key listed here fails with its hint rather than a bare
 * "unknown key".
 */
const REMOVED_KEYS: Readonly<Record<string, string>> = {
	keto: 'removed: use relations',
	authorities:
		'renamed: use roles (a list of alternatives, each a list that must all hold)',
	expression:
		'removed: a rules file carries no code. Register a predicate in code and name it with when: [name]',
	cors: 'removed: it was never enforced',
	rateLimit: 'removed: it was never enforced',
	providers: 'removed: it was never enforced',
};

/** What a relation rung used to call its keys. */
export const RELATION_RUNG_HINTS: Readonly<Record<string, string>> = {
	message: "renamed `code`: it is the refusal's code",
};

/** What a relation term used to call its keys. */
export const RELATION_TERM_HINTS: Readonly<Record<string, string>> = {
	namespace: 'renamed: use type',
	id: 'renamed: use from',
};

/** What a `$` in a role name used to mean. */
export const ROLE_DOMAIN_HINT =
	'`$domain` is removed: per-tenant roles are not in 1.0';

/** The message for the unknown keys of one object. */
export function unknownKeysMessage(
	keys: readonly string[],
	extra: Readonly<Record<string, string>> = {},
): string {
	return keys
		.map((key) => {
			const hint = extra[key] ?? REMOVED_KEYS[key];
			return hint ? `\`${key}\` is ${hint}` : `unknown key \`${key}\``;
		})
		.join('; ');
}

/** A strict object whose unknown keys are explained rather than just refused. */
export function strict<T extends z.ZodRawShape>(
	shape: T,
	extra?: Readonly<Record<string, string>>,
) {
	return z.strictObject(shape, {
		error: (issue) =>
			issue.code === 'unrecognized_keys'
				? unknownKeysMessage(issue.keys, extra)
				: undefined,
	});
}
