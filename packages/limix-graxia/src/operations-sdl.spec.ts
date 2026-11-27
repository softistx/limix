import { describe, expect, it } from 'bun:test';
import { buildSchema } from 'graphql';
import { graphqlOperations } from './operations';

const label = (ops: ReturnType<typeof graphqlOperations>) =>
	ops.map((o) => `${o.type}.${o.field}${o.root ? '*' : ''}`);

describe('graphqlOperations (SDL)', () => {
	it('reads SDL that uses undefined directives and types, without building', () => {
		const sdl = `type Query { me: Ghost @check(x: 1) }`;
		expect(() => buildSchema(sdl)).toThrow();
		expect(label(graphqlOperations(sdl))).toEqual(['Query.me*']);
	});

	it('merges extend type blocks without repeating a field', () => {
		const sdl = `
type Query { a: String }
extend type Query { b: String a: String }
type Mutation { m: Boolean }`;
		expect(label(graphqlOperations(sdl))).toEqual([
			'Query.a*',
			'Query.b*',
			'Mutation.m*',
		]);
	});

	it('honours a schema block and extension', () => {
		const sdl = `
schema { query: Root }
extend schema { subscription: Live }
type Root { a: String }
type Live { tick: Int }
type Query { x: String }`;
		expect(label(graphqlOperations(sdl))).toEqual(['Root.a*', 'Live.tick*']);
		expect(label(graphqlOperations(sdl, { fields: 'all' }))).toEqual([
			'Root.a*',
			'Live.tick*',
			'Query.x',
		]);
	});

	it('agrees with the schema reader', () => {
		const sdl = `type Query { a: String } type Mutation { m: Int } type User { id: ID }`;
		for (const fields of ['roots', 'all'] as const) {
			expect(graphqlOperations(sdl, { fields })).toEqual(
				graphqlOperations(buildSchema(sdl), { fields }),
			);
		}
	});

	it('ignores interfaces, inputs and enums', () => {
		const sdl = `type Query { a: String } interface I { f: Int } input In { x: Int } enum E { A }`;
		expect(label(graphqlOperations(sdl, { fields: 'all' }))).toEqual([
			'Query.a*',
		]);
	});

	it('throws on a syntax error', () => {
		expect(() => graphqlOperations('type {')).toThrow();
	});
});
