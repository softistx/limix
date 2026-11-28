import { createSchema } from '@softistx/graxia';
import { GraphQLError } from 'graphql';
import { demoClaims } from './demo-claims';
import type { Store } from './store';

const typeDefs = await Bun.file(
	new URL('../schema.graphql', import.meta.url).pathname,
).text();

/** The context a resolver reads: the request, for who owns what a mutation adds. */
interface Ctx {
	readonly request: Request;
}

/**
 * The resolvers know nothing about limix: the rules in front of each field
 * decide whether they run. `Author.email` returns the email unconditionally;
 * `Author.email` in src/policy.ts is what keeps it from non-admins.
 */
export function buildSchema(store: Store) {
	const ownerOf = (ctx: Ctx) =>
		String(demoClaims(ctx)['userId'] ?? 'anonymous');
	const missing = (what: string) =>
		new GraphQLError(`${what} not found`, {
			extensions: { code: 'not-found' },
		});
	return createSchema<Ctx>()({
		typeDefs,
		resolvers: {
			Query: {
				books: () => store.books(),
				book: (_, { id }) => store.book(id) ?? null,
				authors: () => store.authors(),
				author: (_, { id }) => store.author(id) ?? null,
				me: (_, __, ctx) => ownerOf(ctx),
			},
			Mutation: {
				addBook: (_, { title, year, authorId }, ctx) => {
					if (store.author(authorId) === undefined) throw missing('author');
					return store.add({ title, year, authorId }, ownerOf(ctx));
				},
				updateBook: (_, { id, title, year }) => {
					const book = store.update(id, {
						...(title == null ? {} : { title }),
						...(year == null ? {} : { year }),
					});
					if (book === undefined) throw missing('book');
					return book;
				},
				deleteBook: (_, { id }) => store.remove(id),
			},
			Book: {
				author: (book) => {
					const author = store.author(book.authorId);
					if (author === undefined) throw missing('author');
					return author;
				},
			},
			Author: {
				books: (author) => store.booksOf(author.id),
			},
		},
	});
}
