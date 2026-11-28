import type { Condition } from '@softistx/limix';
import type { Store } from '../store';

/**
 * The condition names `when` may use: the one place they are listed, so a rules
 * block types itself against `RestRules<BooksCondition>` without importing the
 * factory (and without a cycle with policy.ts).
 */
export type BooksCondition = 'ownsBook';

/**
 * A condition is code. `ownsBook` reads the book id where each transport puts
 * it: the route's `param.id` on REST, the field's `args.id` on GraphQL. An
 * admin passes: `when` narrows the roles, it never widens them, so the
 * condition answers for the admin itself.
 */
export function conditionsFor(store: Store) {
	return {
		ownsBook: ({ claims, request, args }) => {
			if (Array.isArray(claims['roles']) && claims['roles'].includes('admin')) {
				return true;
			}
			const id = idOf(request, args);
			const book = typeof id === 'string' ? store.book(id) : undefined;
			return book !== undefined && book.ownerId === claims['userId'];
		},
	} satisfies Record<BooksCondition, Condition>;
}

/**
 * The conditions' `request` and `args` are `unknown` (one condition serves both
 * transports), so the id is narrowed by hand: REST puts it in `request.params`,
 * GraphQL in `args`.
 */
function idOf(request: unknown, args: unknown): unknown {
	const params = (request as { params?: Record<string, unknown> } | undefined)
		?.params;
	return (
		params?.['id'] ?? (args as Record<string, unknown> | undefined)?.['id']
	);
}
