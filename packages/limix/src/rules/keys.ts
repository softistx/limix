/**
 * The flat key spellings, which belong to `definePolicy` only: a rules file
 * (YAML or JSON) is nested, a path pattern keyed by method under `rest` and a
 * type name keyed by field under `graphql`.
 *
 * REST: a flat key is `METHOD /pattern` (method `*` for any).
 * GraphQL: a flat key is `Type.field` or `Type.*`.
 *
 * `nest.ts` turns them into nested ones; the rules format refuses them with
 * the hint of `flatKeyHint`.
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
/** `Query.me`, `Note.*`. */
export const FLAT_GRAPHQL_KEY = new RegExp(`^${FLAT_GRAPHQL_SOURCE}`);

/** The keys the rules format accepts under `rest`: anything but a flat one. */
export const NOT_FLAT_REST_KEY = new RegExp(`^(?!${FLAT_REST_SOURCE})`);
/** The keys the rules format accepts under `graphql`: anything but a flat one. */
export const NOT_FLAT_GRAPHQL_KEY = new RegExp(`^(?!${FLAT_GRAPHQL_SOURCE})`);

/** Splits a flat REST key into its method and its path pattern. */
export function splitFlatRest(key: string): {
	method: string;
	pattern: string;
} {
	const space = key.indexOf(' ');
	return { method: key.slice(0, space), pattern: key.slice(space + 1) };
}

/** Splits a flat GraphQL key into its type and its field. */
export function splitFlatGraphql(key: string): {
	type: string;
	field: string;
} {
	const dot = key.indexOf('.');
	return { type: key.slice(0, dot), field: key.slice(dot + 1) };
}

/** Why a flat key is refused in a rules file, and what to write instead. */
export function flatKeyHint(block: 'rest' | 'graphql', key: string): string {
	if (block === 'rest') {
		const { method, pattern } = splitFlatRest(key);
		return `\`${key}\` is a definePolicy key; in a rules file write "${pattern}": { ${method === '*' ? '"*"' : method}: … }`;
	}
	const { type, field } = splitFlatGraphql(key);
	return `\`${key}\` is a definePolicy key; in a rules file write ${type}: { ${field === '*' ? '"*"' : field}: … }`;
}

/** The message of a refused flat key under `rest` or `graphql`, or `undefined` for any other key. */
export function flatKeyProblem(
	block: 'rest' | 'graphql',
	key: string,
): string | undefined {
	const flat = block === 'rest' ? FLAT_REST_KEY : FLAT_GRAPHQL_KEY;
	return flat.test(key) ? flatKeyHint(block, key) : undefined;
}
