import { describe, expect, expectTypeOf, test } from 'bun:test';
import { createGraxia, type Empty } from '@softistx/graxia';
import { guardSchema } from './guard';
import type { LimixGraxiaOptions } from './options';
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

describe('LimixGraxiaOptions, the default context', () => {
	test('a bare LimixGraxiaOptions means an empty context', () => {
		expectTypeOf<LimixGraxiaOptions>().toEqualTypeOf<
			LimixGraxiaOptions<Empty>
		>();
		const bare: LimixGraxiaOptions = { policy, claims: () => claims.anon };
		expect(bare.claims({})).toBe(claims.anon);
		// @ts-expect-error a bare options type reads no host context field
		const reads: LimixGraxiaOptions = { policy, claims: (ctx) => ctx.request };
		expect(reads).toBeDefined();
	});

	test('a context is an object', () => {
		// @ts-expect-error a context is an object
		type Bad = LimixGraxiaOptions<string>;
		expectTypeOf<Bad>().not.toBeAny();
	});

	test('guardSchema<Host> takes claims that read the host context', () => {
		interface Host {
			request: Request;
		}
		const schema = guardSchema<Host>(fixtureSchema(), {
			policy,
			claims: (ctx) =>
				ctx.request.headers.has('x-user') ? claims.admin : claims.anon,
		});
		expect(schema).toBeDefined();
	});
});
