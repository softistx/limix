import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware, responds } from '@softistx/alxia';
import { allowAll, policy, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

const withUser = defineMiddleware(async (_ctx, next) =>
	next({ user: { id: 'u1' } }),
);

describe('limixGuard, types', () => {
	test('claims may read what an earlier middleware added', () => {
		const app = alxia().use(withUser);
		expect(() =>
			app.use(
				limixGuard({
					policy,
					claims: (ctx: { user: { id: string } }) => ({
						authenticated: ctx.user.id === 'u1',
					}),
					app,
				}),
			),
		).not.toThrow();
	});

	test('claims reading what no earlier middleware gave is a compile error', () => {
		const app = alxia();
		expect(() =>
			app.use(
				// @ts-expect-error `user` is missing from the context: add a middleware that gives it first
				limixGuard({
					policy,
					claims: (ctx: { user: { id: string } }) => ({
						authenticated: ctx.user.id === 'u1',
					}),
					app,
				}),
			),
		).not.toThrow();
	});

	test('mapRefusal answers an error status, a 302 is a compile error', () => {
		const app = alxia();
		const mapped = (status: 404 | 409) =>
			limixGuard({
				policy,
				claims: whoOf,
				app,
				mapRefusal: () => ({ status }),
			});
		expect(() => mapped(404)).not.toThrow();
		expect(() =>
			limixGuard({
				policy,
				claims: whoOf,
				app: alxia(),
				// @ts-expect-error 302 is no error status alxia can answer a refusal with
				mapRefusal: () => ({ status: 302 }),
			}),
		).not.toThrow();
	});

	test('a route that declares its responses still compiles and answers behind the guard', async () => {
		const body = {
			'~standard': {
				version: 1,
				vendor: 'spec',
				validate: (value: unknown) => ({ value: value as { ok: string } }),
				types: undefined as unknown as {
					input: { ok: string };
					output: { ok: string };
				},
			},
		} as const;
		const app = alxia();
		app.use(limixGuard({ policy: allowAll, claims: whoOf, app }));
		app.get('/open', responds({ 200: body }), ({ reply }) =>
			reply(200, { ok: 'x' }),
		);
		const res = await app.fetch(new Request('http://localhost/open'));
		expect(await res.json()).toEqual({ ok: 'x' });
	});
});
