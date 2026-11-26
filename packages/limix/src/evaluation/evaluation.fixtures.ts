import { type Condition, compilePolicy, definePolicy } from '../rules';
import type { Claims } from './claims';
import type { RelationChecker, RelationQuery } from './relations';

type Document = Parameters<typeof definePolicy>[0];

/** Compiles a document with the conditions a spec registers. */
export function policyOf(
	document: Omit<Document, 'limix'>,
	conditions: Record<string, Condition> = {},
) {
	return compilePolicy(definePolicy({ limix: 1, ...document }), {
		conditions,
	});
}

export const anonymous: Claims = { authenticated: false };

export const user = (extra: Partial<Claims> = {}): Claims => ({
	authenticated: true,
	subject: { type: 'user', id: 'u1' },
	...extra,
});

/** A checker that records each call and answers by a function of the query. */
export function recordingChecker(
	answer: (query: RelationQuery) => boolean = () => true,
) {
	const calls: RelationQuery[][] = [];
	const checker: RelationChecker = {
		check: async (queries) => {
			calls.push(queries);
			return queries.map(answer);
		},
	};
	return { checker, calls };
}
