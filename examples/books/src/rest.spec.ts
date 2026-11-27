import { describe, expect, test } from 'bun:test';
import { freshApp, rest } from './app.fixtures';

const newBook = { title: 'The Lathe of Heaven', year: 1971, authorId: 'a1' };

describe('REST: who gets which status', () => {
	test('reads are public, for everybody', async () => {
		const { app } = await freshApp();
		for (const user of [undefined, 'reader', 'alice', 'admin']) {
			for (const path of [
				'/health',
				'/books',
				'/books/b1',
				'/authors',
				'/authors/a1',
				'/authors/a1/books',
			]) {
				expect((await rest(app, 'GET', path, user)).status).toBe(200);
			}
		}
	});

	test('an anonymous caller is 401 where a signed-in one is 403', async () => {
		const { app } = await freshApp();
		expect((await rest(app, 'POST', '/books', undefined, newBook)).status).toBe(
			401,
		);
		expect((await rest(app, 'POST', '/books', 'reader', newBook)).status).toBe(
			403,
		);
		expect((await rest(app, 'GET', '/admin/stats')).status).toBe(401);
		expect((await rest(app, 'GET', '/admin/stats', 'alice')).status).toBe(403);
	});

	test('an editor or an admin may add a book', async () => {
		const { app } = await freshApp();
		for (const user of ['alice', 'bob', 'admin']) {
			expect((await rest(app, 'POST', '/books', user, newBook)).status).toBe(
				201,
			);
		}
	});

	test('/admin/health is public: written before the * /admin/* wildcard', async () => {
		const { app } = await freshApp();
		expect((await rest(app, 'GET', '/admin/health')).status).toBe(200);
	});

	test('"* /admin/*" judges every method: DELETE /admin/cache is for the admin', async () => {
		const { app } = await freshApp();
		expect((await rest(app, 'DELETE', '/admin/cache')).status).toBe(401);
		expect((await rest(app, 'DELETE', '/admin/cache', 'alice')).status).toBe(
			403,
		);
		expect((await rest(app, 'DELETE', '/admin/cache', 'admin')).status).toBe(
			204,
		);
		expect((await rest(app, 'GET', '/admin/stats', 'admin')).status).toBe(200);
	});

	test('the refusal is the app error format', async () => {
		const { app } = await freshApp();
		expect(
			(await rest(app, 'GET', '/admin/stats', 'reader')).body,
		).toMatchObject({
			code: 'auth.errors.forbidden',
		});
	});

	test('an editor changes only the books they own (the ownsBook condition)', async () => {
		const { app } = await freshApp();
		// b1 belongs to alice, b2 to bob.
		expect(
			(await rest(app, 'PUT', '/books/b1', 'alice', { title: 'New' })).status,
		).toBe(200);
		expect(
			(await rest(app, 'PUT', '/books/b2', 'alice', { title: 'New' })).status,
		).toBe(403);
		expect((await rest(app, 'DELETE', '/books/b2', 'alice')).status).toBe(403);
		expect((await rest(app, 'DELETE', '/books/b1', 'alice')).status).toBe(204);
		expect(
			(await rest(app, 'PUT', '/books/b2', 'bob', { year: 1962 })).status,
		).toBe(200);
	});

	test('an admin changes any book, a reader none', async () => {
		const { app } = await freshApp();
		expect(
			(await rest(app, 'PUT', '/books/b2', 'admin', { title: 'X' })).status,
		).toBe(200);
		expect(
			(await rest(app, 'PUT', '/books/b3', 'reader', { title: 'X' })).status,
		).toBe(403);
		expect(
			(await rest(app, 'PUT', '/books/b3', undefined, { title: 'X' })).status,
		).toBe(401);
	});

	test('unmatched: deny refuses a route no rule names (401 anonymous, 403 signed in)', async () => {
		const { app } = await freshApp();
		app.get('/unruled', ({ reply }) => reply(200, { ok: true }));
		expect((await rest(app, 'GET', '/unruled')).status).toBe(401);
		expect((await rest(app, 'GET', '/unruled', 'alice')).status).toBe(403);
		expect((await rest(app, 'GET', '/unruled', 'admin')).status).toBe(403);
	});
});
