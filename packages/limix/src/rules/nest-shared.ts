import { formatPath, type RulesIssue } from './error';

/** A nested place and the flat key it was written as: `rest['/a'].GET` and `rest['GET /a']`. */
export type Origin = readonly [nested: string, written: string];

export const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export const duplicate = (
	first: PropertyKey[],
	second: PropertyKey[],
	name: string,
): RulesIssue => ({
	path: formatPath(second),
	message: `duplicate rule: ${formatPath(first)} and ${formatPath(second)} both name ${name}`,
});

/** A refusal of a group that is not an object, for a list (a single block leaves it to the schema). */
export const notAGroup = (
	where: PropertyKey[],
	value: unknown,
	what: string,
): RulesIssue => ({
	path: formatPath(where),
	message: `${what} must be an object, received ${
		value === null ? 'null' : Array.isArray(value) ? 'an array' : typeof value
	}`,
});
