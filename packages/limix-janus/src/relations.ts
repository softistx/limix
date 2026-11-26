import type { RelationChecker, RelationQuery, Subject } from '@softistx/limix';

/**
 * What `janusRelations` reads of `permissions({ model, store })`: its `can`.
 * Typed loosely on purpose, so any model's `Permissions` is accepted without a
 * cast; the call itself is checked by janus at run time.
 */
export interface JanusAccess {
	readonly can: (...args: never[]) => Promise<boolean>;
}

export interface JanusRelationsOptions {
	/** What `permissions({ model, store })` answered. */
	readonly access: JanusAccess;
	/**
	 * The janus subject a `claims.subject` stands for. Defaults to
	 * `{ type, id }` as is; use it when your claims name users differently from
	 * your janus user types (a prefix, another type name).
	 */
	readonly subjectOf?: (subject: Subject) => Subject;
	/**
	 * The `ctx` janus passes to the `when` conditions a permission reaches,
	 * read from the query. Omit it and `can` is called with no options; a
	 * permission that reaches a `when` then throws, as in janus.
	 */
	readonly ctxOf?: (query: RelationQuery) => unknown;
}

type CanArgs = [
	subject: Subject,
	permission: string,
	object: RelationQuery['object'],
	options?: { readonly ctx: unknown },
];

/**
 * A `RelationChecker` over janus `can`: each `RelationQuery` becomes
 * `can(subject, relation, { type, id })`, the relation read as a janus
 * relation or permission name. One walk per query, concurrently; the answers
 * come back in the order of the queries. A janus error (`STORE_FAILED`,
 * `PERMISSION_DEPTH`, a malformed id) propagates: it is never a denial.
 */
export function janusRelations(
	options: JanusRelationsOptions,
): RelationChecker {
	const can = options.access.can as unknown as (
		...args: CanArgs
	) => Promise<boolean>;
	const { subjectOf, ctxOf } = options;
	return {
		check: (queries) =>
			Promise.all(
				queries.map((query) => {
					const subject = subjectOf ? subjectOf(query.subject) : query.subject;
					const args: CanArgs = [
						{ type: subject.type, id: subject.id },
						query.relation,
						{ type: query.object.type, id: query.object.id },
					];
					if (ctxOf) args.push({ ctx: ctxOf(query) });
					return can(...args);
				}),
			),
	};
}
