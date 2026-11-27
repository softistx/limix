import { describe, expect, test } from 'bun:test';
import { createGraxia } from '@softistx/graxia';
import { guardSchema } from './guard';
import { limixGraxia } from './plugin';
import { claims, fixtureSchema, policy } from './schema.fixtures';

const options = {
	policy,
	claims: (ctx: { request: Request }) =>
		ctx.request.headers.has('x-user') ? claims.admin : claims.anon,
};

describe('limixGraxia(), the host context type', () => {
	test('a host context that carries what `claims` reads is accepted', () => {
		createGraxia({
			schema: guardSchema(fixtureSchema(), options),
			plugins: [limixGraxia(options)],
			context: ({ request }: { request: Request }) => ({ request }),
		});
		expect(true).toBe(true);
	});

	test('a host context that lacks it is a type error', () => {
		createGraxia({
			schema: guardSchema(fixtureSchema(), options),
			// @ts-expect-error `claims` reads `request`, which this context lacks
			plugins: [limixGraxia(options)],
			context: () => ({ tenant: 'acme' }),
		});
		expect(true).toBe(true);
	});
});
