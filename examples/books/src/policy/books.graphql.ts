import type { GraphqlRules } from '../generated/limix';
import type { BooksCondition } from './conditions';

/** The GraphQL rules of the books API, checked against the schema where they live. */
export const booksGraphql = {
	// Flat form: "Type.field".
	'Query.books': { public: true },
	'Query.book': { public: true },
	'Query.authors': { public: true },
	'Query.author': { public: true },
	'Query.me': { authenticated: true },

	// Every Mutation field with no rule of its own: an editor or an admin. An
	// exact rule beats the wildcard wherever it is written.
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

	// A rule on a field of a non-root type: wherever an Author appears (a list,
	// a book's author), reading its email needs an admin. The field is nullable,
	// so a refusal nulls the email and leaves the rest of the author.
	'Author.email': { roles: [['admin']] },
} satisfies GraphqlRules<BooksCondition>;
