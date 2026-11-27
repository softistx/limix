/**
 * How a key of `rest` and `graphql` is read, in one place: the zod schemas
 * (and so the JSON schema) and `compile/entries.ts` share these patterns.
 *
 * REST: a flat key is `METHOD /pattern` (method `*` for any); a key that looks
 * like one and is not (`get /x`, `GET  /x`, `PROPFIND /x`) is refused rather
 * than read as a path with a space; anything else is a path pattern whose
 * value is keyed by method.
 *
 * GraphQL: a flat key is `Type.field` or `Type.*`; any other key holding a dot,
 * and a `*` type, is refused; anything else is a type name.
 */

/** The methods a rule may name, in the order docs list them. */
export const REST_METHODS = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'HEAD',
	'OPTIONS',
	'CONNECT',
	'TRACE',
	'QUERY',
] as const;

const FLAT_REST_SOURCE = `(?:${REST_METHODS.join('|')}|\\*) \\S.*$`;
const FLAT_GRAPHQL_SOURCE = '[_A-Za-z]\\w*\\.(?:[_A-Za-z]\\w*|\\*)$';

/** `POST /users/:id`, `* /admin/*`. */
export const FLAT_REST_KEY = new RegExp(`^${FLAT_REST_SOURCE}`);
/** A key shaped like a flat one that is not (`get /x`): refused. */
export const MALFORMED_REST_KEY = new RegExp(
	`^(?!${FLAT_REST_SOURCE})[^/\\s]+\\s+/`,
);
/** A path pattern: its value is keyed by method. */
export const NESTED_REST_KEY = new RegExp(
	`^(?!${FLAT_REST_SOURCE})(?![^/\\s]+\\s+/)`,
);

/** `Query.me`, `Note.*`. */
export const FLAT_GRAPHQL_KEY = new RegExp(`^${FLAT_GRAPHQL_SOURCE}`);
/** A dotted key that is not `Type.field`, and a `*` type: refused. */
export const MALFORMED_GRAPHQL_KEY = new RegExp(
	`^(?!${FLAT_GRAPHQL_SOURCE})(?:\\*|[\\s\\S]*\\.[\\s\\S]*)$`,
);
/** A type name other than the three roots, which the schema lists itself. */
export const NESTED_GRAPHQL_KEY =
	/^(?!Query$|Mutation$|Subscription$)(?!\*$)[^.]*$/;

/** The marker a refused key carries out of zod; `parseRules` swaps in the message. */
export const BAD_KEY = 'bad key';

/** Why a key under `rest` is refused, or `undefined` when it is a flat or nested one. */
export function restKeyProblem(key: string): string | undefined {
	return MALFORMED_REST_KEY.test(key)
		? `\`${key}\` is not a rule key: a flat key is a method (${REST_METHODS.join(', ')} or *), one space, then the path pattern`
		: undefined;
}

/** Why a key under `graphql` is refused, or `undefined` when it is a flat or nested one. */
export function graphqlKeyProblem(key: string): string | undefined {
	if (!MALFORMED_GRAPHQL_KEY.test(key)) return undefined;
	return key === '*' || key.startsWith('*.')
		? 'a wildcard names fields, not types: write Type.* (for example Query.*)'
		: `\`${key}\` is not a field key: write Type.field (for example Query.me) or Type.*`;
}
