import { describe, expect, it } from 'bun:test';
import { definePolicy } from './define';
import { RulesError } from './error';

const base = { limix: 1 as const, global: { unmatched: 'deny' as const } };

function issuesOf(run: () => unknown) {
	try {
		run();
	} catch (error) {
		if (error instanceof RulesError) return [...error.issues];
		throw error;
	}
	throw new Error('expected a RulesError');
}

// What the compiler refuses is never run.
const typeOnly = (_check: () => unknown): void => {};

describe('definePolicy: rules split across blocks', () => {
	it('merges a list into what the single block gives', () => {
		const single = definePolicy({
			...base,
			rest: {
				'GET /books': { public: true },
				'/books/:id': { GET: { authenticated: true } },
				'POST /books': { roles: [['admin']] },
			},
			graphql: {
				'Query.me': { authenticated: true },
				Mutation: { publish: { roles: [['editor']] } },
			},
		});
		const split = definePolicy({
			...base,
			rest: [
				{ 'GET /books': { public: true } },
				{ '/books/:id': { GET: { authenticated: true } } },
				{ 'POST /books': { roles: [['admin']] } },
			],
			graphql: [
				{ 'Query.me': { authenticated: true } },
				{ Mutation: { publish: { roles: [['editor']] } } },
			],
		});
		expect(split).toEqual(single);
		expect(Object.keys(split.rest ?? {})).toEqual(['/books', '/books/:id']);
	});

	it('keeps list order as first-match order', () => {
		const rules = definePolicy({
			...base,
			rest: [
				{ '/b': { GET: { public: true } } },
				{ '/a': { GET: { public: true } } },
			],
		});
		expect(Object.keys(rules.rest ?? {})).toEqual(['/b', '/a']);
	});

	it('accepts an empty list', () => {
		expect(definePolicy({ ...base, rest: [], graphql: [] })).toEqual({
			...base,
			rest: {},
			graphql: {},
		});
	});

	it('refuses a rule written in two nested blocks, naming both', () => {
		const issues = issuesOf(() =>
			definePolicy({
				...base,
				rest: [
					{ '/books': { GET: { public: true } } },
					{ '/books': { GET: { authenticated: true } } },
				],
			}),
		);
		expect(issues).toEqual([
			{
				path: "rest[1]['/books'].GET",
				message:
					"duplicate rule: rest[0]['/books'].GET and rest[1]['/books'].GET both name GET /books",
			},
		]);
	});

	it('refuses a flat rule and a nested one for the same method', () => {
		const issues = issuesOf(() =>
			definePolicy({
				...base,
				rest: [
					{ '/books': { GET: { public: true } } },
					{ 'GET /books': { authenticated: true } },
				],
			}),
		);
		expect(issues.map((issue) => issue.message)).toEqual([
			"duplicate rule: rest[0]['/books'].GET and rest[1]['GET /books'] both name GET /books",
		]);
	});

	it('refuses a field written in two graphql blocks', () => {
		const issues = issuesOf(() =>
			definePolicy({
				...base,
				graphql: [
					{ 'Query.me': { public: true } },
					{ Query: { me: { authenticated: true } } },
				],
			}),
		);
		expect(issues.map((issue) => issue.message)).toEqual([
			"duplicate rule: graphql[0]['Query.me'] and graphql[1].Query.me both name Query.me",
		]);
	});

	it('refuses a flat rule that would jump over an earlier block', () => {
		const issues = issuesOf(() =>
			definePolicy({
				...base,
				rest: [
					{ '/a': { GET: { public: true } } },
					{ '/b': { GET: { public: true } } },
					{ '* /a': { authenticated: true } },
				],
			}),
		);
		expect(issues[0]?.path).toBe("rest[2]['* /a']");
	});

	it('names the written key of an invalid rule inside a block', () => {
		const issues = issuesOf(() =>
			definePolicy({
				...base,
				rest: [{}, { 'GET /a': { roles: [[]] } }],
			}),
		);
		expect(issues[0]?.path).toBe("rest[1]['GET /a'].roles[0]");
	});

	it('refuses a block that is not an object', () => {
		const issues = issuesOf(() =>
			definePolicy({ ...base, rest: [null] } as never),
		);
		expect(issues).toEqual([
			{ path: 'rest[0]', message: 'a rules block must be an object' },
		]);
		const graphql = issuesOf(() =>
			definePolicy({ ...base, graphql: [{}, 3] } as never),
		);
		expect(graphql[0]?.path).toBe('graphql[1]');
	});

	it('refuses a nested group joined across blocks over a competing rule, naming the block', () => {
		const issues = issuesOf(() =>
			definePolicy({
				...base,
				rest: [
					{ '/b': { GET: { public: true } } },
					{ '/a': { '*': { authenticated: true } } },
					{ '/b': { POST: { authenticated: true } } },
				],
			}),
		);
		expect(issues).toEqual([
			{
				path: "rest[2]['/b'].POST",
				message:
					'`POST /b` would move above `* /a`: write it with the first `/b` rules, in rest[0], or write `/a` after it',
			},
		]);
	});

	it('keeps the block index of a group that is not an object', () => {
		expect(
			issuesOf(() =>
				definePolicy({ ...base, graphql: [{}, { Query: 3 }] } as never),
			),
		).toEqual([
			{
				path: 'graphql[1].Query',
				message: 'a type group must be an object, received number',
			},
		]);
		expect(
			issuesOf(() =>
				definePolicy({
					...base,
					rest: [{ '/a': { GET: { public: true } } }, { '/a': 3 }],
				} as never),
			),
		).toEqual([
			{
				path: "rest[1]['/a']",
				message: 'a path group must be an object, received number',
			},
		]);
	});

	it('joins a graphql type written in two blocks', () => {
		const split = definePolicy({
			...base,
			graphql: [
				{ Query: { me: { authenticated: true } } },
				{ 'Query.books': { public: true } },
				{ Query: { orders: { roles: [['admin']] } } },
			],
		});
		expect(split.graphql).toEqual({
			Query: {
				me: { authenticated: true },
				books: { public: true },
				orders: { roles: [['admin']] },
			},
		});
	});

	it('takes a single rest block beside a list of graphql blocks', () => {
		const rules = definePolicy({
			...base,
			rest: { 'GET /books': { public: true } },
			graphql: [
				{ 'Query.me': { authenticated: true } },
				{ 'Query.books': { public: true } },
			],
		});
		expect(rules.rest).toEqual({ '/books': { GET: { public: true } } });
		expect(Object.keys(rules.graphql?.['Query'] ?? {})).toEqual([
			'me',
			'books',
		]);
	});

	it('fails to compile on a typo inside a list', () => {
		typeOnly(() =>
			definePolicy({
				...base,
				rest: [
					{
						// @ts-expect-error GTE is not a method
						'/a': { GTE: {} },
					},
				],
			}),
		);
	});
});
