import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import {
	call,
	fakeRelations,
	ok,
	policy as plain,
	whoOf,
	withRelations,
} from './app.fixtures';
import { limixGuard } from './guard';

describe('limixGuard, relations', () => {
	test('asks the checker for the object in the path: allowed, and 404 by default when it is not', async () => {
		const relations = fakeRelations(['note:n1']);
		const app = alxia();
		app.use(
			limixGuard({ policy: withRelations, claims: whoOf, relations, app }),
		);
		app.get('/notes/:id', ok);
		expect((await call(app, '/notes/n1', { who: 'reader' })).status).toBe(200);
		const hidden = await call(app, '/notes/n2', { who: 'reader' });
		expect(hidden.status).toBe(404);
		expect(await hidden.json()).toEqual({ code: 'auth.errors.not-found' });
		expect(relations.state.calls).toBe(2);
	});

	test('a function of the context is called once per request, and only when the rules use relations', async () => {
		let made = 0;
		const checker = fakeRelations(['note:n1']);
		const app = alxia();
		app.use(
			limixGuard({
				policy: withRelations,
				claims: whoOf,
				relations: () => {
					made++;
					return checker;
				},
				app,
			}),
		);
		app.get('/notes/:id', ok);
		await call(app, '/notes/n1', { who: 'reader' });
		await call(app, '/notes/n1', { who: 'reader' });
		expect(made).toBe(2);
	});

	test('a relations function is not called for a policy with no relations', async () => {
		let made = 0;
		const app = alxia();
		app.use(
			limixGuard({
				policy: plain,
				claims: whoOf,
				relations: () => {
					made++;
					return fakeRelations([]);
				},
				app,
			}),
		);
		app.get('/open', ok);
		app.get('/me', ok);
		app.get('/notes/:id', ok);
		app.delete('/notes/:id', ok);
		app.post('/notes', ok);
		app.get('/files/*', ok);
		await call(app, '/open');
		expect(made).toBe(0);
	});

	test('a refusal-shaped error thrown by the relations function is answered with its own code', async () => {
		const app = alxia();
		app.use(
			limixGuard({
				policy: withRelations,
				claims: whoOf,
				relations: () => {
					throw Object.assign(new Error('x'), {
						code: 'tenancy.errors.unknown-tenant',
						status: 404,
					});
				},
				app,
			}),
		);
		app.get('/notes/:id', ok);
		const res = await call(app, '/notes/n1', { who: 'reader' });
		expect(await res.json()).toEqual({ code: 'tenancy.errors.unknown-tenant' });
	});
});
