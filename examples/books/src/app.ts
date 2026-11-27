import { alxia } from '@softistx/alxia';
import { type LimixAlxiaOptions, limixGuard } from '@softistx/limix-alxia';
import { limixGraphql } from '@softistx/limix-alxia/graphql';
import { demoClaims } from './demo-claims';
import { loadPolicy } from './policy';
import { buildSchema } from './schema';
import { createStore, type Store } from './store';

interface BookBody {
	title?: unknown;
	year?: unknown;
	authorId?: unknown;
}

/** A JSON body as an object, or an empty one: the handlers validate the fields. */
async function bodyOf(request: Request): Promise<BookBody> {
	try {
		const body: unknown = await request.json();
		return typeof body === 'object' && body !== null ? body : {};
	} catch {
		return {};
	}
}

/**
 * One alxia app serving REST and GraphQL behind one `limix` options object:
 * the guard judges every REST route, the GraphQL endpoint judges each field,
 * both from the same rules and the same claims.
 */
export async function buildApp(store: Store = createStore()) {
	const app = alxia();
	const policy = await loadPolicy(store);
	const limix: LimixAlxiaOptions<{ request: Request }> = {
		policy,
		claims: demoClaims,
		app,
	};

	// The guard first: a route declared above it would stay open.
	app.use(limixGuard(limix));

	app.get('/health', ({ reply }) => reply(200, { ok: true }));

	app.get('/books', ({ reply }) => reply(200, store.books()));
	app.get('/books/:id', ({ params, reply }) => {
		const book = store.book(params.id);
		return book ? reply(200, book) : reply(404, { code: 'not-found' });
	});
	app.post('/books', async ({ request, reply }) => {
		const { title, year, authorId } = await bodyOf(request);
		if (
			typeof title !== 'string' ||
			typeof year !== 'number' ||
			typeof authorId !== 'string' ||
			store.author(authorId) === undefined
		) {
			return reply(400, { code: 'invalid-book' });
		}
		// limix-alxia does not hand the claims the guard resolved to a REST
		// handler (only GraphQL has `ctx.limix.claims()`), so the demo decoder
		// is read again; a real app derives the user in a middleware instead.
		const owner = String(demoClaims({ request })['userId']);
		return reply(201, store.add({ title, year, authorId }, owner));
	});
	app.put('/books/:id', async ({ request, params, reply }) => {
		const { title, year } = await bodyOf(request);
		const book = store.update(params.id, {
			...(typeof title === 'string' ? { title } : {}),
			...(typeof year === 'number' ? { year } : {}),
		});
		return book ? reply(200, book) : reply(404, { code: 'not-found' });
	});
	app.delete('/books/:id', ({ params, reply }) =>
		store.remove(params.id)
			? reply(204, undefined)
			: reply(404, { code: 'not-found' }),
	);

	app.get('/authors', ({ reply }) =>
		reply(200, store.authors().map(publicAuthor)),
	);
	app.get('/authors/:id', ({ params, reply }) => {
		const author = store.author(params.id);
		return author
			? reply(200, publicAuthor(author))
			: reply(404, { code: 'not-found' });
	});
	app.get('/authors/:id/books', ({ params, reply }) =>
		reply(200, store.booksOf(params.id)),
	);

	app.get('/admin/health', ({ reply }) => reply(200, { ok: true }));
	app.delete('/admin/cache', ({ reply }) => reply(204, undefined));
	app.get('/admin/stats', ({ reply }) =>
		reply(200, {
			books: store.books().length,
			authors: store.authors().length,
		}),
	);

	// The same `limix` object as the guard.
	limixGraphql(app, { schema: buildSchema(store), limix });
	return { app, limix, policy };
}

/** REST never shows an author's email: that field is for the admin, over GraphQL. */
function publicAuthor({
	email: _,
	...author
}: {
	email: string;
	id: string;
	name: string;
}) {
	return author;
}
