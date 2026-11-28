import './generated/limix';
import './vocabulary';
import {
	type CompiledPolicy,
	compilePolicy,
	definePolicy,
} from '@softistx/limix';
import { adminRest } from './policy/admin';
import { booksGraphql } from './policy/books.graphql';
import { booksRest } from './policy/books.rest';
import { conditionsFor } from './policy/conditions';
import type { Store } from './store';

/**
 * The policy of the books API: who may reach each route and each field, written
 * in code, so the types check it. Reference: packages/limix/docs/rules.md
 *
 * The rules live in `src/policy/`, one block per concern, each checked where it
 * is written (`satisfies RestRules<…>` / `GraphqlRules<…>`, aliases the
 * generated file exports). This file combines them. See "Splitting a policy
 * across files" in packages/limix/docs/rules.md.
 *
 * Three things type-check the blocks: `src/generated/limix.ts` (the
 * operations of the API, from openapi.yaml and schema.graphql: a path, method,
 * type or field the API lacks is a compile error), `src/vocabulary.ts` (the
 * roles and permissions) and `conditions` (the names `when` may use).
 *
 * `definePolicy` takes the flat spelling (`"POST /books"`, `"Query.me"`) beside
 * the nested one (`"/books": { GET }`, `Query: { me }`) and nests it in document
 * order; what it returns is the same nested `Rules` a rules file would hold.
 */
export function policyFor(store: Store): CompiledPolicy {
	const conditions = conditionsFor(store);

	const rules = definePolicy(
		{
			limix: 1,
			global: {
				// The policy is the exhaustive list of what the service exposes: a route
				// or a root field no rule names is refused (401 anonymous, 403 signed in).
				unmatched: 'deny',
			},
			// Each list is read in order as one document, so the order is the
			// first-match order. A rule written in two blocks is refused. The admin
			// block is last: its "* /admin/*" wildcard comes after everything else.
			rest: [booksRest, adminRest],
			graphql: booksGraphql,
		},
		{ conditions },
	);
	return compilePolicy(rules, { conditions });
}
