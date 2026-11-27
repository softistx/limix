import { describe, expect, test } from 'bun:test';
import { freshApp, gql } from './app.fixtures';

describe('GraphQL: fields and who may read them', () => {
	test('public reads work for an anonymous caller', async () => {
		const { app } = await freshApp();
		const result = await gql(app, '{ books { title year author { name } } }');
		expect(result.status).toBe(200);
		expect(result.errors).toBeUndefined();
		expect(result.data?.['books']).toHaveLength(3);
	});

	test('a refused root field carries the error code and the HTTP status', async () => {
		const { app } = await freshApp();
		const result = await gql(app, '{ me }');
		expect(result.status).toBe(401);
		expect(result.errors?.[0]?.extensions?.code).toBe(
			'auth.errors.unauthenticated',
		);
		expect((await gql(app, '{ me }', 'reader')).data).toEqual({ me: 'reader' });
	});

	test('Author.email is for the admin: null and an error for everyone else', async () => {
		const { app } = await freshApp();
		const query = '{ author(id: "a1") { name email } }';
		const anonymous = await gql(app, query);
		expect(anonymous.data).toEqual({
			author: { name: 'Ursula K. Le Guin', email: null },
		});
		expect(anonymous.errors?.[0]?.extensions?.code).toBe(
			'auth.errors.unauthenticated',
		);
		const editor = await gql(app, query, 'alice');
		expect(editor.data).toEqual({
			author: { name: 'Ursula K. Le Guin', email: null },
		});
		expect(editor.errors?.[0]?.extensions?.code).toBe('auth.errors.forbidden');
		const admin = await gql(app, query, 'admin');
		expect(admin.errors).toBeUndefined();
		expect(admin.data).toEqual({
			author: { name: 'Ursula K. Le Guin', email: 'ursula@example.com' },
		});
	});

	test('the restriction follows the author through a book', async () => {
		const { app } = await freshApp();
		const query = '{ book(id: "b1") { author { email } } }';
		expect((await gql(app, query, 'alice')).data).toEqual({
			book: { author: { email: null } },
		});
		expect((await gql(app, query, 'admin')).data).toEqual({
			book: { author: { email: 'ursula@example.com' } },
		});
	});

	test('Mutation.* needs an editor or an admin', async () => {
		const { app } = await freshApp();
		const add =
			'mutation { addBook(title: "T", year: 2000, authorId: "a2") { id title } }';
		expect((await gql(app, add)).status).toBe(401);
		expect((await gql(app, add, 'reader')).status).toBe(403);
		const added = await gql(app, add, 'bob');
		expect(added.errors).toBeUndefined();
		expect(added.data?.['addBook']).toMatchObject({ title: 'T' });
	});

	test("the ownsBook condition: alice updates her book, not bob's", async () => {
		const { app } = await freshApp();
		const update = (id: string) =>
			`mutation { updateBook(id: "${id}", title: "Changed") { title } }`;
		const mine = await gql(app, update('b1'), 'alice');
		expect(mine.errors).toBeUndefined();
		expect(mine.data).toEqual({ updateBook: { title: 'Changed' } });
		const bobs = await gql(app, update('b2'), 'alice');
		expect(bobs.status).toBe(403);
		expect(bobs.errors?.[0]?.extensions?.code).toBe('auth.errors.forbidden');
		expect((await gql(app, update('b2'), 'admin')).errors).toBeUndefined();
	});

	test('Mutation.deleteBook is for the admin alone', async () => {
		const { app } = await freshApp();
		const remove = 'mutation { deleteBook(id: "b1") }';
		expect((await gql(app, remove, 'alice')).status).toBe(403);
		expect((await gql(app, remove, 'admin')).data).toEqual({
			deleteBook: true,
		});
	});
});
