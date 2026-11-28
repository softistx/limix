import { formatPath, type RulesIssue } from './error';
import { FLAT_GRAPHQL_KEY, splitFlatGraphql } from './keys';
import { duplicate, isObject, type Origin } from './nest-shared';

/** Nests the flat keys of a `graphql` block by type; GraphQL rules are not first-match. */
export function nestGraphql(
	graphql: Record<string, unknown>,
	issues: RulesIssue[],
	origins: Origin[],
) {
	const types = new Map<string, Map<string, unknown>>();
	const written = new Map<string, PropertyKey[]>();
	const passed = new Map<string, unknown>();
	const place = (
		type: string,
		field: string,
		rule: unknown,
		where: PropertyKey[],
	) => {
		const fields = types.get(type) ?? new Map<string, unknown>();
		types.set(type, fields);
		const name = `${type}.${field}`;
		const first = written.get(name);
		if (first) {
			issues.push(duplicate(first, where, name));
			return;
		}
		written.set(name, where);
		if (where.length === 2) {
			origins.push([formatPath(['graphql', type, field]), formatPath(where)]);
		}
		fields.set(field, rule);
	};
	for (const [key, value] of Object.entries(graphql)) {
		if (value === undefined) continue;
		if (FLAT_GRAPHQL_KEY.test(key)) {
			const { type, field } = splitFlatGraphql(key);
			place(type, field, value, ['graphql', key]);
		} else if (isObject(value)) {
			if (!types.has(key)) types.set(key, new Map());
			for (const [field, rule] of Object.entries(value)) {
				if (rule !== undefined)
					place(key, field, rule, ['graphql', key, field]);
			}
		} else {
			passed.set(key, value);
		}
	}
	return Object.fromEntries([
		...[...types].map(
			([type, fields]) => [type, Object.fromEntries(fields)] as const,
		),
		...passed,
	]);
}
