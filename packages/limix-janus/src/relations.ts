import type { ModelConfig, Permissions } from '@softistx/janus/permissions';
import type { RelationChecker, RelationQuery, Subject } from '@softistx/limix';

export interface JanusRelationsOptions<C extends ModelConfig = ModelConfig> {
	/**
	 * What `permissions({ model, store })` answered; only its `can` is read,
	 * and it must be janus's own.
	 */
	readonly access: Pick<Permissions<C>, 'can'>;
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
export function janusRelations<C extends ModelConfig>(
	options: JanusRelationsOptions<C>,
): RelationChecker {
	// The one cast: `relation` is a plain string, janus types it from the model.
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
					return can(...args).then((answer) => {
						if (typeof answer !== 'boolean') {
							throw new TypeError(
								`limix-janus: access.can answered ${typeof answer}, not a boolean`,
							);
						}
						return answer;
					});
				}),
			),
	};
}
