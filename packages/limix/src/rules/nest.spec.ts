import { describe, expect, it } from 'bun:test';
import { RulesError } from './error';
import { toNested } from './nest';
import { parseRules } from './parse';

const base = { limix: 1 as const, global: { unmatched: 'deny' as const } };
const pub = { public: true };
const auth = { authenticated: true };

const nested = (input: object) => toNested({ ...base, ...input } as never);
const issuesOf = (input: object) => {
	try {
		nested(input);
	} catch (error) {
		if (error instanceof RulesError) return [...error.issues];
		throw error;
	}
	throw new Error('expected a RulesError');
};

describe('toNested: REST', () => {
	it('leaves a nested document as it is, in order', () => {
		const input = {
			rest: { '/z': { GET: pub, POST: auth }, '/a': { '*': pub } },
			graphql: { Query: { me: auth } },
		};
		const out = nested(input);
		expect(out).toEqual({ ...base, ...input });
		expect(Object.keys(out.rest ?? {})).toEqual(['/z', '/a']);
	});

	it('nests a flat key under its path, in document order', () => {
		const out = nested({
			rest: {
				'/z': { GET: pub },
				'GET /a': pub,
				'POST /y': auth,
				'* /c': pub,
			},
		});
		expect(out.rest).toEqual({
			'/z': { GET: pub },
			'/a': { GET: pub },
			'/y': { POST: auth },
			'/c': { '*': pub },
		});
		expect(Object.keys(out.rest ?? {})).toEqual(['/z', '/a', '/y', '/c']);
	});

	it('keeps a path with a space whole', () => {
		expect(nested({ rest: { 'GET /a b': pub } }).rest).toEqual({
			'/a b': { GET: pub },
		});
	});

	it('joins a flat rule to an earlier key of the same pattern', () => {
		const out = nested({
			rest: { 'GET /a': pub, 'POST /a': auth, '/b': { GET: pub } },
		});
		expect(out.rest).toEqual({
			'/a': { GET: pub, POST: auth },
			'/b': { GET: pub },
		});
	});

	it('joins a nested group to an earlier flat key, and a flat key to an earlier nested group', () => {
		expect(
			nested({ rest: { 'GET /a': pub, '/a': { POST: auth } } }).rest,
		).toEqual({ '/a': { GET: pub, POST: auth } });
		expect(
			nested({ rest: { '/a': { GET: pub }, 'POST /a': auth } }).rest,
		).toEqual({ '/a': { GET: pub, POST: auth } });
	});

	it('moves a rule above entries it cannot compete with', () => {
		const out = nested({
			rest: { 'POST /a': auth, 'GET /b': pub, 'PUT /a': auth },
		});
		expect(Object.keys(out.rest ?? {})).toEqual(['/a', '/b']);
		expect(out.rest?.['/a']).toEqual({ POST: auth, PUT: auth });
	});

	it('refuses a move above a rule of the same method, saying how to fix it', () => {
		expect(
			issuesOf({ rest: { 'POST /a': auth, 'GET /b': pub, 'GET /a': pub } }),
		).toEqual([
			{
				path: "rest['GET /a']",
				message:
					'`GET /a` would move above `GET /b`: nest it under `/a`, or write `/b` after it',
			},
		]);
	});

	it('refuses a move above a method * rule, and a method * rule moving above any', () => {
		expect(
			issuesOf({ rest: { 'GET /a': pub, '* /b': pub, 'POST /a': auth } }).map(
				(i) => i.message,
			),
		).toEqual([
			'`POST /a` would move above `* /b`: nest it under `/a`, or write `/b` after it',
		]);
		expect(
			issuesOf({ rest: { 'GET /a': pub, 'POST /b': pub, '* /a': auth } }).map(
				(i) => i.message,
			),
		).toEqual([
			'`* /a` would move above `POST /b`: nest it under `/a`, or write `/b` after it',
		]);
	});

	it('treats HEAD and GET as competing, since HEAD faces the GET rules', () => {
		expect(
			issuesOf({ rest: { 'POST /a': pub, 'GET /b': pub, 'HEAD /a': pub } }),
		).toHaveLength(1);
		expect(
			issuesOf({ rest: { 'POST /a': pub, 'HEAD /b': pub, 'GET /a': pub } }),
		).toHaveLength(1);
	});

	it('refuses a nested group joining an earlier key over a competing rule', () => {
		expect(
			issuesOf({
				rest: { 'GET /a': pub, 'GET /b': pub, '/a': { GET: auth } },
			}).map((i) => i.message),
		).toEqual([
			"duplicate rule: rest['GET /a'] and rest['/a'].GET both name GET /a",
		]);
		expect(
			issuesOf({
				rest: { 'POST /a': pub, 'GET /b': pub, '/a': { GET: auth } },
			}).map((i) => i.message),
		).toEqual([
			'`GET /a` would move above `GET /b`: nest it under `/a`, or write `/b` after it',
		]);
	});

	it('refuses a flat and a nested spelling of the same rule, naming both', () => {
		expect(issuesOf({ rest: { 'POST /a': pub, '/a': { POST: pub } } })).toEqual(
			[
				{
					path: "rest['/a'].POST",
					message:
						"duplicate rule: rest['POST /a'] and rest['/a'].POST both name POST /a",
				},
			],
		);
	});

	it('refuses a flat rule written twice, naming both', () => {
		expect(
			issuesOf({ rest: { '/a': { '*': pub }, '* /a': pub } }).map(
				(i) => i.message,
			),
		).toEqual([
			"duplicate rule: rest['/a']['*'] and rest['* /a'] both name * /a",
		]);
	});

	it('reports every problem at once', () => {
		expect(
			issuesOf({
				rest: {
					'POST /a': pub,
					'GET /b': pub,
					'GET /a': pub,
					'/a': { POST: pub },
				},
			}),
		).toHaveLength(2);
	});

	it('passes a value that is no object through for parseRules to refuse', () => {
		expect(nested({ rest: { '/a': 'nope' } }).rest).toEqual({
			'/a': 'nope',
		} as never);
	});
});

describe('toNested: GraphQL', () => {
	it('nests flat keys by type, in first-appearance order', () => {
		const out = nested({
			graphql: {
				'Query.a': pub,
				'Note.*': auth,
				Query: { b: pub },
				'Note.id': pub,
				'Mutation.m': auth,
			},
		});
		expect(out.graphql).toEqual({
			Query: { a: pub, b: pub },
			Note: { '*': auth, id: pub },
			Mutation: { m: auth },
		});
		expect(Object.keys(out.graphql ?? {})).toEqual([
			'Query',
			'Note',
			'Mutation',
		]);
	});

	it('refuses a rule written twice, naming both', () => {
		expect(
			issuesOf({ graphql: { 'Query.me': pub, Query: { me: pub } } }),
		).toEqual([
			{
				path: 'graphql.Query.me',
				message:
					"duplicate rule: graphql['Query.me'] and graphql.Query.me both name Query.me",
			},
		]);
	});
});

describe('toNested: the result', () => {
	it('is what parseRules gives for the nested document', () => {
		const flat = nested({
			rest: { 'GET /a': pub, '/b': { PUT: auth }, 'POST /a': auth },
			graphql: { 'Query.me': auth, 'Note.*': pub },
		});
		const written = {
			...base,
			rest: { '/a': { GET: pub, POST: auth }, '/b': { PUT: auth } },
			graphql: { Query: { me: auth }, Note: { '*': pub } },
		};
		expect(parseRules(flat)).toEqual(parseRules(written));
		expect(Object.keys(parseRules(flat).rest ?? {})).toEqual(['/a', '/b']);
	});

	it('keeps the other keys of the document', () => {
		const out = nested({ rest: { 'GET /a': pub }, 'x-note': 1 });
		expect(out).toMatchObject({ limix: 1, 'x-note': 1 });
	});
});
