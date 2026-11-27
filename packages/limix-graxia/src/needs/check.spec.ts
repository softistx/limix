import { describe, expect, it } from 'bun:test';
import { compiled, schemaOf } from '../needs.fixtures';
import { checkNeeds } from './check';

const kinds = (sdl: string, graphql: Record<string, Record<string, object>>) =>
	checkNeeds(compiled({ graphql }), schemaOf(sdl)).map(
		(i) => `${i.kind} ${i.coordinate}`,
	);

describe('checkNeeds', () => {
	it('is silent when @needs and the rule agree', () => {
		expect(
			kinds(
				`type Query { a: String @needs(permission: "x") b: String @needs(anyOf: ["x","y"]) c: String }`,
				{
					Query: {
						a: { permissions: [['x']] },
						b: { permissions: [['x'], ['y']] },
						c: { public: true },
					},
				},
			),
		).toEqual([]);
	});

	it('reports @needs without a rule, or with a rule that enforces nothing', () => {
		expect(
			kinds(
				`type Query { a: String @needs(permission: "x") b: String @needs(permission: "x") c: String @needs(permission: "x") }`,
				{
					Query: {
						b: { public: true },
						c: { authenticated: true },
					},
				},
			),
		).toEqual([
			'needs-without-rule Query.a',
			'needs-unenforced Query.b',
			'needs-unenforced Query.c',
		]);
	});

	it('reports looser and stricter', () => {
		const out = checkNeeds(
			compiled({
				graphql: {
					Query: {
						loose: { permissions: [['x', 'y']] },
						strict: { permissions: [['x']] },
					},
				},
			}),
			schemaOf(
				`type Query { loose: String @needs(permission: "x") strict: String @needs(permission: "x") @needs(permission: "y") }`,
			),
		);
		expect(out.map((i) => `${i.kind} ${i.coordinate}`)).toEqual([
			'needs-looser Query.loose',
			'needs-stricter Query.strict',
		]);
		expect(out[0]).toMatchObject({
			path: 'graphql.Query.loose',
			needs: [['x']],
			permissions: [['x', 'y']],
		});
		expect(out[0]?.fix).toContain('Query.loose');
	});

	it('suggests @needs for a rule without one', () => {
		const [found] = checkNeeds(
			compiled({
				graphql: { Query: { a: { permissions: [['x'], ['y', 'z']] } } },
			}),
			schemaOf(`type Query { a: String }`),
		);
		expect(found?.kind).toBe('rule-without-needs');
		expect(found?.suggestion).toBe(
			'@needs(anyOf: ["x","y"]) @needs(anyOf: ["x","z"])',
		);
	});

	it('adds the @needs of the type and of the returned type', () => {
		expect(
			kinds(
				`type Query { book: Book  user: User @needs(permission: "u") } type Book @needs(permission: "b") { id: ID } type User { id: ID @needs(permission: "u2") }`,
				{
					Query: {
						book: { permissions: [['b']] },
						user: { permissions: [['u']] },
					},
					User: { id: { permissions: [['u2']] } },
					Book: { id: { permissions: [['b']] } },
				},
			),
		).toEqual([]);
	});

	it('reports an invalid @needs', () => {
		expect(
			kinds(`type Query { a: String @needs }`, {
				Query: { a: { public: true } },
			}),
		).toEqual(['needs-invalid Query.a']);
	});

	it('reports a field too complex to compare', () => {
		const uses = Array.from(
			{ length: 11 },
			(_, i) => `@needs(anyOf: ["a${i}", "b${i}"])`,
		).join(' ');
		expect(
			kinds(`type Query { a: String ${uses} }`, {
				Query: { a: { permissions: [['a0']] } },
			}),
		).toEqual(['needs-too-complex Query.a']);
	});

	it('ignores introspection and fields with neither side', () => {
		expect(kinds(`type Query { a: String }`, {})).toEqual([]);
	});
});
