import type { RestRules } from '../generated/limix';
import type { BooksCondition } from './conditions';

/**
 * The REST rules of the books and authors routes. The `satisfies` checks the
 * block where it lives: a path or method the API lacks, a role or permission
 * `vocabulary.ts` does not declare and a condition not in `BooksCondition` are
 * compile errors.
 */
export const booksRest = {
	// Flat form: one key per operation, "METHOD /path".
	'GET /health': { public: true },

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
		// `when` names a condition of `conditionsFor`: an editor may change only a
		// book they own; an admin may change any.
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
} satisfies RestRules<BooksCondition>;
