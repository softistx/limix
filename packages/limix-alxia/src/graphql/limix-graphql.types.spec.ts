import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import type { LimixAlxiaOptions } from '../options';
import { gqlPolicy, schema } from './graphql.fixtures';
import { limixGraphql } from './limix-graphql';

const withUser = defineMiddleware(async (_ctx, next) =>
	next({ user: { id: 'u1' } }),
);

describe('limixGraphql, types', () => {
	test("the options the guard takes are the ones limixGraphql takes, claims reading a middleware's additions", () => {
		const app = alxia().use(withUser);
		const limix: LimixAlxiaOptions<{ user: { id: string } }> = {
			policy: gqlPolicy,
			claims: (ctx) => ({ authenticated: ctx.user.id === 'u1' }),
			app,
		};
		app.use(limixGuard(limix));
		expect(() => limixGraphql(app, { schema: schema(), limix })).not.toThrow();
	});

	test('claims reading what the app never adds is a compile error', () => {
		const app = alxia();
		const limix: LimixAlxiaOptions<{ user: { id: string } }> = {
			policy: gqlPolicy,
			claims: whoOf as never,
			app,
		};
		expect(() =>
			limixGraphql(app, {
				schema: schema(),
				// @ts-expect-error the GraphQL context has no `user`: add a middleware that gives it first
				limix,
			}),
		).not.toThrow();
	});
});
