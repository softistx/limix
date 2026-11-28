import './generated/limix';
import './vocabulary';
import {
	type CompiledPolicy,
	type ConditionMap,
	compilePolicy,
	definePolicy,
} from '@softistx/limix';
import type { Store } from './store';

/**
 * The policy of the books API: who may reach each route and each field, written
 * in code, so the types check it. Reference: packages/limix/docs/rules.md
 *
 * Three things type-check what is written here: `src/generated/limix.ts` (the
 * operations of the API, from openapi.yaml and schema.graphql: a path, method,
 * type or field the API lacks is a compile error), `src/vocabulary.ts` (the
 * roles and permissions) and `conditions` (the names `when` may use).
 *
 * `definePolicy` takes the flat spelling (`"POST /books"`, `"Query.me"`) beside
 * the nested one (`"/books": { GET }`, `Query: { me }`) and nests it in document
 * order; what it returns is the same nested `Rules` a rules file would hold.
 */
export function policyFor(store: Store): CompiledPolicy {
	// A condition is code. `ownsBook` reads the book id where each transport puts
	// it: the route's `param.id` on REST, the field's `args.id` on GraphQL. An
	// admin passes: `when` narrows the roles, it never widens them, so the
	// condition answers for the admin itself.
	const conditions = {
		ownsBook: ({ claims, request, args }) => {
			if (Array.isArray(claims['roles']) && claims['roles'].includes('admin')) {
				return true;
			}
			const id = idOf(request, args);
			const book = typeof id === 'string' ? store.book(id) : undefined;
			return book !== undefined && book.ownerId === claims['userId'];
		},
	} satisfies ConditionMap;

	const rules = definePolicy(
		{
			limix: 1,
			global: {
				// The policy is the exhaustive list of what the service exposes: a route
				// or a root field no rule names is refused (401 anonymous, 403 signed in).
				unmatched: 'deny',
			},
			rest: {
				// Flat form: one key per operation, "METHOD /path".
				'GET /health': { public: true },

				// Document order: the first rule that matches applies. /admin/health is
				// public, so it is written BEFORE the "* /admin/*" wildcard further down,
				// which would otherwise take it and ask for an admin.
				'GET /admin/health': { public: true },

				// Nested form: one path, its methods together.
				'/books': { GET: { public: true } },
				// A flat key joins the nested path written just above it. Roles are in
				// disjunctive normal form: the outer list is OR, each inner list is AND.
				// Here: an editor OR an admin, and in both cases the permission.
				'POST /books': {
					roles: [['editor'], ['admin']],
					permissions: [['books:write']],
				},

				'/books/:id': {
					GET: { public: true },
					// `when` names a condition of `conditions` above: an editor may change
					// only a book they own; an admin may change any.
					PUT: {
						roles: [['editor'], ['admin']],
						permissions: [['books:write']],
						when: ['ownsBook'],
					},
					DELETE: {
						roles: [['editor'], ['admin']],
						permissions: [['books:write']],
						when: ['ownsBook'],
					},
				},

				'GET /authors': { public: true },
				'GET /authors/:id': { public: true },
				// A pattern with a parameter in the middle: it takes /authors/7/books.
				'GET /authors/:id/books': { public: true },

				// Method wildcard: every method under /admin. The "*" of the path takes
				// one or more characters.
				'* /admin/*': { roles: [['admin']] },
			},
			graphql: {
				// Flat form: "Type.field".
				'Query.books': { public: true },
				'Query.book': { public: true },
				'Query.authors': { public: true },
				'Query.author': { public: true },
				'Query.me': { authenticated: true },

				// Every Mutation field with no rule of its own: an editor or an admin.
				// An exact rule beats the wildcard wherever it is written.
				'Mutation.*': {
					roles: [['editor'], ['admin']],
					permissions: [['books:write']],
				},
				// Nested form: a type, then its fields. It joins the Mutation rules above.
				Mutation: {
					updateBook: {
						roles: [['editor'], ['admin']],
						permissions: [['books:write']],
						when: ['ownsBook'],
					},
					// Deleting from GraphQL is stricter than over REST: admin only.
					deleteBook: { roles: [['admin']] },
				},

				// A rule on a field of a non-root type: wherever an Author appears (a
				// list, a book's author), reading its email needs an admin. The field is
				// nullable, so a refusal nulls the email and leaves the rest of the author.
				'Author.email': { roles: [['admin']] },
			},
		},
		{ conditions },
	);
	return compilePolicy(rules, { conditions });
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
