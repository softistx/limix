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

describe('parseRules: flat keys', () => {
	it('accepts a flat REST key and a flat GraphQL key', () => {
		const rules = parseRules({
			...base,
			rest: { 'POST /users/:id': { roles: [['admin']] } },
			graphql: { 'Query.me': { authenticated: true } },
		});
		expect(rules.rest?.['POST /users/:id']).toEqual({ roles: [['admin']] });
		expect(rules.graphql?.['Query.me']).toEqual({ authenticated: true });
	});

	it('mixes flat and nested keys and keeps document order', () => {
		const rules = parseRules({
			...base,
			rest: {
				'/z': { GET: { public: true } },
				'GET /a': { public: true },
				'/b': { '*': { authenticated: true } },
				'* /c': { authenticated: true },
				'POST /y': { public: true },
			},
			graphql: {
				'Query.a': { public: true },
				Query: { b: { public: true } },
				'Note.*': { authenticated: true },
				Note: { id: { public: true } },
			},
		});
		expect(Object.keys(rules.rest ?? {})).toEqual([
			'/z',
			'GET /a',
			'/b',
			'* /c',
			'POST /y',
		]);
		expect(Object.keys(rules.graphql ?? {})).toEqual([
			'Query.a',
			'Query',
			'Note.*',
			'Note',
		]);
	});

	it('accepts the method * under a path and a flat "* /a"', () => {
		const rules = parseRules({
			...base,
			rest: { '/a': { '*': { public: true } }, '* /b': { public: true } },
		});
		expect(rules.rest?.['/a']).toEqual({ '*': { public: true } });
	});

	it('keeps a path with a space nested', () => {
		const rules = parseRules({
			...base,
			rest: { '/a b': { GET: { public: true } } },
		});
		expect(Object.keys(rules.rest ?? {})).toEqual(['/a b']);
	});

	it('refuses a key that looks flat and is not, with the rule key message', () => {
		for (const key of ['get /x', 'GET  /x', 'PROPFIND /x']) {
			expect(parseIssues({ rest: { [key]: { public: true } } })).toEqual([
				{
					path: `rest['${key}']`,
					message: `\`${key}\` is not a rule key: a flat key is a method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, CONNECT, TRACE, QUERY or *), one space, then the path pattern`,
				},
			]);
		}
	});

	it('hints at a rule term written under a path pattern', () => {
		const issues = parseIssues({ rest: { '/x': { roles: [['a']] } } });
		expect(issues).toEqual([
			{
				path: "rest['/x'].roles",
				message:
					'`roles` is a term of a rule, not a method: write "GET /x": {...} or nest it under a method',
			},
		]);
	});

	it('refuses a wildcard type, *.field and a dotted key that is not Type.field', () => {
		const wildcard =
			'a wildcard names fields, not types: write Type.* (for example Query.*)';
		expect(parseIssues({ graphql: { '*.me': { public: true } } })).toEqual([
			{ path: "graphql['*.me']", message: wildcard },
		]);
		expect(parseIssues({ graphql: { '*': { me: { public: true } } } })).toEqual(
			[{ path: "graphql['*']", message: wildcard }],
		);
		expect(parseIssues({ graphql: { 'Query.a.b': { public: true } } })).toEqual(
			[
				{
					path: "graphql['Query.a.b']",
					message:
						'`Query.a.b` is not a field key: write Type.field (for example Query.me) or Type.*',
				},
			],
		);
	});

	it('validates the rule of a flat key', () => {
		const issues = parseIssues({
			rest: { 'GET /x': { public: true, authenticated: true, roles: [] } },
		});
		expect(issues.map((i) => i.path)).toEqual(["rest['GET /x'].roles"]);
		expect(
			parseIssues({ graphql: { 'Query.me': { GET: {} } } }).map((i) => i.path),
		).toEqual(["graphql['Query.me'].GET"]);
	});
});

describe('compilePolicy: flat keys', () => {
	const duplicate = (a: string, b: string, what: string) =>
		`duplicate rule: ${a} and ${b} both name ${what}`;

	it('refuses a flat and a nested spelling of the same rule, naming both', () => {
		expect(
			compileIssues({
				rest: {
					'POST /users/:id': { public: true },
					'/users/:id': { POST: { public: true } },
				},
			}),
		).toEqual([
			{
				path: "rest['/users/:id'].POST",
				message: duplicate(
					"rest['POST /users/:id']",
					"rest['/users/:id'].POST",
					'POST /users/:id',
				),
			},
		]);
		expect(
			compileIssues({
				graphql: {
					'Query.me': { public: true },
					Query: { me: { public: true } },
				},
			}),
		).toEqual([
			{
				path: 'graphql.Query.me',
				message: duplicate(
					"graphql['Query.me']",
					'graphql.Query.me',
					'Query.me',
				),
			},
		]);
	});

	it('refuses two flat spellings, and the method * spelled both ways', () => {
		expect(
			compileIssues({
				rest: { '* /a': { public: true }, '/a': { '*': { public: true } } },
			}).map((i) => i.message),
		).toEqual([duplicate("rest['* /a']", "rest['/a']['*']", '* /a')]);
	});

	it('treats one trailing slash as the same pattern', () => {
		expect(
			compileIssues({
				rest: { 'GET /a/': { public: true }, 'GET /a': { public: true } },
			}),
		).toHaveLength(1);
	});

	it('does not refuse different parameter names: that is shadowing', () => {
		expect(() =>
			compilePolicy({
				...base,
				rest: {
					'GET /a/:id': { public: true },
					'GET /a/:uid': { public: true },
				},
			}),
		).not.toThrow();
	});

	it('refuses, at compile time, a rule under a path pattern (definePolicy output)', () => {
		const rules = definePolicy({
			...base,
			rest: { '/x': { roles: [['a']] } },
		});
		expect(issuesOf(() => compilePolicy(rules))).toEqual([
			{
				path: "rest['/x']",
				message:
					'`/x` is a path pattern, so its value is keyed by method; write "GET /x" for a single rule',
			},
		]);
	});

	it('names the issue paths in the spelling of the source', () => {
		const issues = compileIssues({
			rest: { 'GET /a': { when: ['nope'] }, '/b': { '*': { when: ['nope'] } } },
			graphql: { 'Query.me': { when: ['nope'] } },
		});
		expect(issues.map((i) => i.path)).toEqual([
			"rest['GET /a'].when[0]",
			"rest['/b']['*'].when[0]",
			"graphql['Query.me'].when[0]",
		]);
	});

	it('reports an invalid pattern at its key, once per key', () => {
		expect(
			compileIssues({ rest: { 'GET /a(': { public: true } } }).map(
				(i) => i.path,
			),
		).toEqual(["rest['GET /a(']"]);
	});

	it('lists every rule once in restRoutes, in document order', () => {
		const policy = compilePolicy({
			...base,
			rest: {
				'/z': { GET: { public: true }, POST: { public: true } },
				'GET /a': { public: true },
				'* /c': { public: true },
			},
		});
		expect(
			policy.restRoutes.map((r) => [r.method, r.pattern, r.where]),
		).toEqual([
			['GET', '/z', "rest['/z'].GET"],
			['POST', '/z', "rest['/z'].POST"],
			['GET', '/a', "rest['GET /a']"],
			['*', '/c', "rest['* /c']"],
		]);
	});

	it('fans a wildcard rule into every method list, and keeps a * list of its own', () => {
		const policy = compilePolicy({
			...base,
			rest: {
				'GET /a': { public: true },
				'* /c': { public: true },
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

	it('lets an exact method replace the wildcard of the same key, in its own place', () => {
		const policy = compilePolicy({
			...base,
			rest: {
				'/x': { GET: { public: true } },
				'* /y': { authenticated: true },
				'GET /y': { public: true },
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
			compilePolicy({ ...base, rest: { '* /a/:id': { relations } } })
				.usesRelations,
		).toBe(true);
		expect(
			compilePolicy({ ...base, graphql: { 'Note.*': { relations } } })
				.usesRelations,
		).toBe(true);
	});

	it('stores a Type.* rule under the field "*" of the table', () => {
		const policy = compilePolicy({
			...base,
			graphql: {
				'Note.*': { authenticated: true },
				'Note.id': { public: true },
			},
		});
		expect(Object.keys(policy.graphql?.['Note'] ?? {})).toEqual(['*', 'id']);
		expect(policy.graphql?.['Note']?.['*']).toMatchObject({
			wildcard: true,
			where: "graphql['Note.*']",
		});
		expect(policy.graphql?.['Note']?.['id']?.wildcard).toBe(false);
	});
});

describe('definePolicy: flat keys', () => {
	it('accepts both forms and refuses a bad method under a path', () => {
		const rules = definePolicy({
			...base,
			rest: {
				'GET /x': { public: true },
				'/y': { GET: { public: true }, '*': { authenticated: true } },
			},
			graphql: {
				'Query.me': { public: true },
				'Note.*': { authenticated: true },
				Query: { other: { public: true } },
			},
		});
		expect(Object.keys(rules.rest ?? {})).toEqual(['GET /x', '/y']);
		definePolicy({
			...base,
			// @ts-expect-error GTE is not a method
			rest: { '/x': { GTE: { public: true } } },
		});
	});
});
