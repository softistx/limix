/**
 * One thing a caller can reach, as an integration lists it. The list is
 * neutral: `limix-graxia` reads it from a GraphQL schema, `limix-alxia` from
 * routes or an OpenAPI spec, and a hand-written array works as well.
 */
export type Operation = RestOperation | GraphqlOperation;

export interface RestOperation {
	kind: 'rest';
	/** Any case; `HEAD` is answered by the `GET` rule too, as in `evaluateRest`. */
	method: string;
	/**
	 * The route pattern in the rules-file spelling: `/documents/:id`, with the
	 * parameter names the rules file uses. It may carry `global.basePath` or
	 * not, as `route` of `evaluateRest` does. A route written another way
	 * (`/documents/{id}`) names no rule: convert an OpenAPI path first.
	 */
	path: string;
}

export interface GraphqlOperation {
	kind: 'graphql';
	type: string;
	field: string;
	/**
	 * Whether `type` is an operation root, so `global.unmatched` governs it, as
	 * `root` of `evaluateField`. Read it from the schema: a renamed root is
	 * still one, and any other type is not.
	 */
	root: boolean;
}

/** `GET /documents/:id` or `Query.me`: how a report names an operation. */
export function labelOf(operation: Operation): string {
	return operation.kind === 'rest'
		? `${operation.method.toUpperCase()} ${operation.path}`
		: `${operation.type}.${operation.field}`;
}

const text = (value: unknown): value is string =>
	typeof value === 'string' && value !== '';

/** Throws a `TypeError` for a value that is neither shape: a JS caller can pass anything. */
export function assertOperation(
	value: unknown,
	index: number,
): asserts value is Operation {
	const operation = value as Record<string, unknown> | null;
	const valid =
		operation !== null &&
		typeof operation === 'object' &&
		(operation['kind'] === 'rest'
			? text(operation['method']) && text(operation['path'])
			: operation['kind'] === 'graphql' &&
				text(operation['type']) &&
				text(operation['field']) &&
				typeof operation['root'] === 'boolean');
	if (!valid) {
		throw new TypeError(
			`coverage: operation ${index} must be { kind: 'rest', method, path } or { kind: 'graphql', type, field, root }`,
		);
	}
}
