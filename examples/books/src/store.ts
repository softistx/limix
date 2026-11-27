/** In-memory data: a few authors and books, and the operations on them. No database. */

export interface Author {
	readonly id: string;
	readonly name: string;
	readonly email: string;
}

export interface Book {
	readonly id: string;
	readonly title: string;
	readonly year: number;
	readonly authorId: string;
	/** The demo user who added the book: what `ownsBook` compares. */
	readonly ownerId: string;
}

export interface NewBook {
	readonly title: string;
	readonly year: number;
	readonly authorId: string;
}

export interface Store {
	authors(): Author[];
	author(id: string): Author | undefined;
	books(): Book[];
	book(id: string): Book | undefined;
	booksOf(authorId: string): Book[];
	add(input: NewBook, ownerId: string): Book;
	update(
		id: string,
		patch: Partial<Pick<Book, 'title' | 'year'>>,
	): Book | undefined;
	remove(id: string): boolean;
}

/** A fresh store, so a spec starts from the same data each time. */
export function createStore(): Store {
	const authors: Author[] = [
		{ id: 'a1', name: 'Ursula K. Le Guin', email: 'ursula@example.com' },
		{ id: 'a2', name: 'Stanislaw Lem', email: 'stanislaw@example.com' },
		{ id: 'a3', name: 'Octavia E. Butler', email: 'octavia@example.com' },
	];
	const books = new Map<string, Book>(
		[
			{
				id: 'b1',
				title: 'The Dispossessed',
				year: 1974,
				authorId: 'a1',
				ownerId: 'alice',
			},
			{
				id: 'b2',
				title: 'Solaris',
				year: 1961,
				authorId: 'a2',
				ownerId: 'bob',
			},
			{
				id: 'b3',
				title: 'Kindred',
				year: 1979,
				authorId: 'a3',
				ownerId: 'alice',
			},
		].map((book) => [book.id, book]),
	);
	let next = 4;
	return {
		authors: () => [...authors],
		author: (id) => authors.find((author) => author.id === id),
		books: () => [...books.values()],
		book: (id) => books.get(id),
		booksOf: (authorId) =>
			[...books.values()].filter((book) => book.authorId === authorId),
		add(input, ownerId) {
			const book = { ...input, id: `b${next++}`, ownerId };
			books.set(book.id, book);
			return book;
		},
		update(id, patch) {
			const found = books.get(id);
			if (found === undefined) return undefined;
			const book = { ...found, ...patch };
			books.set(id, book);
			return book;
		},
		remove: (id) => books.delete(id),
	};
}
