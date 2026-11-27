import { type CompiledPolicy, compilePolicy } from '@softistx/limix';
import { loadRules } from '@softistx/limix/bun';
import type { Store } from './store';

/**
 * The rules file (rules.yaml) and the conditions its `when` names.
 *
 * A condition is code, so a rules file that comes from elsewhere carries none.
 * `ownsBook` reads the book id where each transport puts it: the route's
 * `param.id` on REST, the field's `args.id` on GraphQL. An admin passes: `when`
 * narrows the roles, it never widens them, so the condition answers for the
 * admin itself.
 */
export async function loadPolicy(
	store: Store,
	rulesPath: string = new URL('../rules.yaml', import.meta.url).pathname,
): Promise<CompiledPolicy> {
	const rules = await loadRules(rulesPath);
	return compilePolicy(rules, {
		conditions: {
			ownsBook: ({ claims, request, args }) => {
				if (
					Array.isArray(claims['roles']) &&
					claims['roles'].includes('admin')
				) {
					return true;
				}
				const id = idOf(request, args);
				const book = typeof id === 'string' ? store.book(id) : undefined;
				return book !== undefined && book.ownerId === claims['userId'];
			},
		},
	});
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
