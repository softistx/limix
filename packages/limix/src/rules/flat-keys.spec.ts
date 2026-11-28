import { describe, expect, it } from 'bun:test';
import { compilePolicy } from './compile';
import { definePolicy } from './define';
import { RulesError } from './error';
import { parseRules } from './parse';

const base = { limix: 1 as const, global: { unmatched: 'allow' as const } };

function issuesOf(run: () => unknown): { path: string; message: string }[] {
	try {
		run();
	} catch (error) {
		if (error instanceof RulesError) return [...error.issues];
		throw error;
	}
	throw new Error('expected a RulesError');
}

const parseIssues = (input: object) =>
	issuesOf(() => parseRules({ ...base, ...input }));
const compileIssues = (input: object) =>
	issuesOf(() => compilePolicy({ ...base, ...input } as never));

describe('parseRules: the rules format is nested only', () => {
	it('accepts nested keys, wildcards included, and keeps document order', () => {
		const rules = parseRules({
			...base,
			rest: {
				'/z': { GET: { public: true } },
				'/b': { '*': { authenticated: true } },
				'/files/*': { GET: { public: true } },
				'/y': { POST: { public: true } },
			},
			graphql: {
				Query: { a: { public: true } },
				Note: { '*': { authenticated: true }, id: { public: true } },
			},
		});
		expect(Object.keys(rules.rest ?? {})).toEqual([
			'/z',
			'/b',
			'/files/*',
			'/y',
		]);
		expect(Object.keys(rules.graphql ?? {})).toEqual(['Query', 'Note']);
		expect(rules.rest?.['/b']).toEqual({ '*': { authenticated: true } });
	});

	it('keeps a path with a space nested', () => {
		const rules = parseRules({
			...base,
			rest: { '/a b': { GET: { public: true } } },
		});
		expect(Object.keys(rules.rest ?? {})).toEqual(['/a b']);
	});

	it('refuses a flat REST key, with the nested spelling to write', () => {
		expect(
			parseIssues({
				rest: { 'POST /a': { public: true }, '* /b/*': { public: true } },
			}),
		).toEqual([
			{
				path: "rest['POST /a']",
				message:
					'`POST /a` is a definePolicy key; in a rules file write "/a": { POST: … }',
			},
			{
				path: "rest['* /b/*']",
				message:
					'`* /b/*` is a definePolicy key; in a rules file write "/b/*": { "*": … }',
			},
		]);
	});

	it('refuses a flat GraphQL key, with the nested spelling to write', () => {
		expect(
			parseIssues({
				graphql: {
					'Query.me': { public: true },
					'Note.*': { public: true },
				},
			}),
		).toEqual([
			{
				path: "graphql['Query.me']",
				message:
					'`Query.me` is a definePolicy key; in a rules file write Query: { me: … }',
			},
			{
				path: "graphql['Note.*']",
				message:
					'`Note.*` is a definePolicy key; in a rules file write Note: { "*": … }',
			},
		]);
	});

	it('hints at a rule term written under a path pattern', () => {
		expect(parseIssues({ rest: { '/x': { roles: [['a']] } } })).toEqual([
			{
				path: "rest['/x'].roles",
				message:
					'`roles` is a term of a rule, not a method: nest it under a method (GET: {...}, or "*" for any)',
			},
		]);
	});

	it('validates the rule under a method', () => {
		expect(
			parseIssues({
				rest: {
					'/x': { GET: { public: true, authenticated: true, roles: [] } },
				},
			}).map((i) => i.path),
		).toEqual(["rest['/x'].GET.roles"]);
	});
});

describe('compilePolicy: nested rules', () => {
	const duplicate = (a: string, b: string, what: string) =>
		`duplicate rule: ${a} and ${b} both name ${what}`;

	it('treats one trailing slash as the same pattern', () => {
		expect(
			compileIssues({
				rest: {
					'/a/': { GET: { public: true } },
					'/a': { GET: { public: true } },
				},
			}),
		).toEqual([
			{
				path: "rest['/a'].GET",
				message: duplicate("rest['/a/'].GET", "rest['/a'].GET", 'GET /a'),
			},
		]);
	});

	it('does not refuse different parameter names: that is shadowing', () => {
		expect(() =>
			compilePolicy({
				...base,
				rest: {
					'/a/:id': { GET: { public: true } },
					'/a/:uid': { GET: { public: true } },
				},
			}),
		).not.toThrow();
	});

	it('refuses, at compile time, a rule under a path pattern', () => {
		const rules = { ...base, rest: { '/x': { roles: [['a']] } } };
		expect(issuesOf(() => compilePolicy(rules as never))).toEqual([
			{
				path: "rest['/x']",
				message:
					'`/x` is a path pattern, so its value is keyed by method (for example GET: {...})',
			},
		]);
	});

	it('refuses a method map under a field, which would otherwise fail open', () => {
		const rules = {
			...base,
			rest: { '/x': { GET: { GET: { roles: [['a']] } } } },
		};
		expect(issuesOf(() => compilePolicy(rules as never))).toEqual([
			{
				path: "rest['/x'].GET",
				message:
					"a rule's keys are rule terms (roles, permissions, relations, when, authenticated, public); `GET` is not one",
			},
		]);
	});

	it('refuses a field map under a GraphQL type that is a rule', () => {
		const rules = { ...base, graphql: { Query: { me: { id: {} } } } };
		expect(issuesOf(() => compilePolicy(rules as never))).toEqual([
			{
				path: 'graphql.Query.me',
				message:
					"a rule's keys are rule terms (roles, permissions, relations, when, authenticated, public); `id` is not one",
			},
		]);
	});

	it('names the issue paths as the document is written', () => {
		const issues = compileIssues({
			rest: {
				'/a': { GET: { when: ['nope'] } },
				'/b': { '*': { when: ['nope'] } },
			},
			graphql: { Query: { me: { when: ['nope'] } } },
		});
		expect(issues.map((i) => i.path)).toEqual([
			"rest['/a'].GET.when[0]",
			"rest['/b']['*'].when[0]",
			'graphql.Query.me.when[0]',
		]);
	});

	it('reports an invalid pattern at its key, once per key', () => {
		expect(
			compileIssues({ rest: { '/a(': { GET: { public: true } } } }).map(
				(i) => i.path,
			),
		).toEqual(["rest['/a(']"]);
	});

	it('lists every rule once in restRoutes, in document order', () => {
		const policy = compilePolicy({
			...base,
			rest: {
				'/z': { GET: { public: true }, POST: { public: true } },
				'/a': { GET: { public: true } },
				'/c': { '*': { public: true } },
			},
		});
		expect(
			policy.restRoutes.map((r) => [r.method, r.pattern, r.where]),
		).toEqual([
			['GET', '/z', "rest['/z'].GET"],
			['POST', '/z', "rest['/z'].POST"],
			['GET', '/a', "rest['/a'].GET"],
			['*', '/c', "rest['/c']['*']"],
		]);
	});

	it('fans a wildcard rule into every method list, and keeps a * list of its own', () => {
		const policy = compilePolicy({
			...base,
			rest: {
				'/a': { GET: { public: true } },
				'/c': { '*': { public: true } },
				'/d': { POST: { public: true }, '*': { authenticated: true } },
			},
		});
		const patterns = (method: string) =>
			policy.restRoutesByMethod.get(method)?.map((r) => r.pattern);
		expect(patterns('GET')).toEqual(['/a', '/c', '/d']);
		expect(patterns('POST')).toEqual(['/c', '/d']);
		expect(policy.restRoutesByMethod.get('POST')?.[1]?.method).toBe('POST');
		expect(patterns('*')).toEqual(['/c', '/d']);
		expect(patterns('OPTIONS')).toEqual(['/c', '/d']);
	});

	it('lets an exact method replace the wildcard of the same pattern, in its own place', () => {
		const policy = compilePolicy({
			...base,
			rest: {
				'/x': { GET: { public: true } },
				'/y': { '*': { authenticated: true }, GET: { public: true } },
			},
		});
		expect(
			policy.restRoutesByMethod.get('GET')?.map((r) => [r.method, r.pattern]),
		).toEqual([
			['GET', '/x'],
			['GET', '/y'],
		]);
		expect(
			policy.restRoutesByMethod.get('POST')?.map((r) => [r.method, r.pattern]),
		).toEqual([['*', '/y']]);
	});

	it('sees a relation on a wildcard rule in usesRelations', () => {
		const relations = [{ require: [[{ relation: 'view', type: 'doc' }]] }];
		expect(
			compilePolicy({
				...base,
				rest: { '/a/:id': { '*': { relations } } },
			}).usesRelations,
		).toBe(true);
		expect(
			compilePolicy({ ...base, graphql: { Note: { '*': { relations } } } })
				.usesRelations,
		).toBe(true);
	});

	it('stores a Type.* rule under the field "*" of the table', () => {
		const policy = compilePolicy({
			...base,
			graphql: {
				Note: { '*': { authenticated: true }, id: { public: true } },
			},
		});
		expect(Object.keys(policy.graphql?.['Note'] ?? {})).toEqual(['*', 'id']);
		expect(policy.graphql?.['Note']?.['*']).toMatchObject({
			wildcard: true,
			where: "graphql.Note['*']",
		});
		expect(policy.graphql?.['Note']?.['id']?.wildcard).toBe(false);
	});
});

describe('definePolicy: flat keys', () => {
	it('returns the nested document parseRules gives, flat keys nested in order', () => {
		const rules = definePolicy({
			...base,
			rest: {
				'GET /x': { public: true },
				'/y': { GET: { public: true }, PUT: { authenticated: true } },
				'POST /x': { authenticated: true },
			},
			graphql: {
				'Query.me': { public: true },
				'Note.*': { authenticated: true },
				Query: { other: { public: true } },
			},
		});
		expect(Object.keys(rules.rest ?? {})).toEqual(['/x', '/y']);
		expect(rules.rest?.['/x']).toEqual({
			GET: { public: true },
			POST: { authenticated: true },
		});
		expect(rules.rest?.['GET /x' as string]).toBeUndefined();
		expect(Object.keys(rules.graphql ?? {})).toEqual(['Query', 'Note']);
		expect(rules).toEqual(
			parseRules({
				...base,
				rest: {
					'/x': { GET: { public: true }, POST: { authenticated: true } },
					'/y': { GET: { public: true }, PUT: { authenticated: true } },
				},
				graphql: {
					Query: { me: { public: true }, other: { public: true } },
					Note: { '*': { authenticated: true } },
				},
			}),
		);
	});

	it('validates at run time, as parseRules does', () => {
		const loose = { '/x': { GET: { public: true, authenticated: true } } };
		expect(() => compilePolicy(definePolicy({ ...base, rest: loose }))).toThrow(
			'contradictory',
		);
		expect(
			issuesOf(() =>
				definePolicy({
					...base,
					rest: { '/x': { GET: { roles: [] } } },
				}),
			).map((i) => i.path),
		).toEqual(["rest['/x'].GET.roles"]);
	});

	it('refuses a bad method under a path at compile time, and at run time', () => {
		const run = () =>
			definePolicy({
				...base,
				// @ts-expect-error GTE is not a method
				rest: { '/x': { GTE: { public: true } } },
			});
		expect(run).toThrow('unknown key `GTE`');
	});

	it('refuses a rule written twice, flat and nested', () => {
		expect(
			issuesOf(() =>
				definePolicy({
					...base,
					rest: {
						'POST /x': { public: true },
						'/x': { POST: { public: true } },
					},
				}),
			).map((i) => i.message),
		).toEqual([
			"duplicate rule: rest['POST /x'] and rest['/x'].POST both name POST /x",
		]);
	});
});
