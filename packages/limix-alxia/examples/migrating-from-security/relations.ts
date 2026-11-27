import type { RelationChecker } from '@softistx/limix';

// `ask` is your backend: one string per question, one boolean per string.
// For janus, use `janusRelations` from `@softistx/limix-janus` instead.
export function relationsOver(
	ask: (tuples: readonly string[]) => Promise<boolean[]>,
): RelationChecker {
	return {
		check: (queries) =>
			ask(
				queries.map(
					({ object, relation, subject }) =>
						`${object.type}:${object.id}#${relation}@${subject.type}:${subject.id}`,
				),
			),
	};
}
