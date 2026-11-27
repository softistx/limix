import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { ok, policy, routesOn, withRelations } from './app.fixtures';
import { checkRoutes, policyProblems, rungCodeProblems } from './setup-check';

const rest = (
	rules: Record<string, Record<string, object>>,
	basePath?: string,
) =>
	compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny', ...(basePath ? { basePath } : {}) },
			rest: rules as never,
		}),
	);
const rung = (code: string) => ({
	authenticated: true,
	relations: [
		{ code, require: [[{ relation: 'v', type: 'note', from: 'param.id' }]] },
	],
});

describe('policyProblems', () => {
	test('a policy that fits its app has none', () => {
		const app = routesOn(alxia());
		expect(policyProblems(policy, app)).toEqual([]);
		expect(checkRoutes(policy, app)).toEqual([]);
	});

	test('a rule no route takes is named with its method and pattern', () => {
		const app = alxia().get('/open', ok);
		const problems = policyProblems(policy, app);
		expect(problems).toContain(
			'GET /me: no route of the app takes this rule, so the routes it was written for are left to `unmatched`',
		);
		expect(problems.some((p) => p.startsWith('DELETE /notes/:id'))).toBe(true);
	});

	test('an app with no REST route at all flags every REST rule', () => {
		expect(policyProblems(policy, alxia()).length).toBe(6);
	});

	test('a literal rule behind a parameter route, and the reverse, are taken', () => {
		const rules = rest({ '/users/me': { GET: { public: true } } });
		expect(policyProblems(rules, alxia().get('/users/:id', ok))).toEqual([]);
		const params = rest({ '/users/:id': { GET: { public: true } } });
		expect(policyProblems(params, alxia().get('/users/me', ok))).toEqual([]);
	});

	test('segments that differ, and a wildcard that needs a segment, do not meet', () => {
		const rules = rest({ '/files/*path': { GET: { public: true } } });
		expect(policyProblems(rules, alxia().get('/files', ok))).toHaveLength(1);
		expect(policyProblems(rules, alxia().get('/files/*', ok))).toEqual([]);
		expect(policyProblems(rules, alxia().get('/other/a', ok))).toHaveLength(1);
	});

	test("an alxia route's trailing wildcard takes an empty tail, so a literal rule meets it", () => {
		const rules = rest({
			'/users/me': { GET: { public: true } },
			'/files/*path': { GET: { public: true } },
		});
		expect(
			policyProblems(rules, alxia().get('/users/:id/*', ok).get('/files', ok)),
		).toEqual([expect.stringContaining('GET /files/*path')]);
		expect(
			policyProblems(
				rules,
				alxia().get('/users/:id/*', ok).get('/files/*', ok),
			),
		).toEqual([]);
	});

	test('a method the app never declares is no match, HEAD follows GET', () => {
		const rules = rest({
			'/a': { POST: { public: true }, HEAD: { public: true } },
		});
		const problems = policyProblems(rules, alxia().get('/a', ok));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toStartWith('POST /a');
	});

	test('optional groups and the basePath are read', () => {
		const optional = rest({ '/a{/:id}': { GET: { public: true } } });
		expect(policyProblems(optional, alxia().get('/a', ok))).toEqual([]);
		const based = rest({ '/a': { GET: { public: true } } }, '/api');
		expect(policyProblems(based, alxia().get('/a', ok))).toEqual([]);
		expect(policyProblems(based, alxia().get('/api/a', ok))).toEqual([]);
	});

	test('a rung code outside auth.errors. is named, in REST and in GraphQL', () => {
		const bad = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { '/notes/:id': { GET: rung('app.errors.nope') as never } },
				graphql: { Query: { note: rung('app.errors.also') as never } },
			}),
		);
		const problems = rungCodeProblems(bad);
		expect(problems).toHaveLength(2);
		expect(problems[0]).toContain('GET /notes/:id');
		expect(problems[1]).toContain('Query.note');
		expect(rungCodeProblems(withRelations)).toEqual([]);
		expect(rungCodeProblems(policy)).toEqual([]);
	});
});

describe('checkRoutes', () => {
	test('returns every problem as an issue and never throws', () => {
		const app = alxia().get('/open', ok);
		const issues = checkRoutes(policy, app);
		expect(issues).toHaveLength(5);
		expect(issues.every((issue) => issue.kind === 'unmatched-rule')).toBe(true);
		expect(issues[0]).toEqual({
			kind: 'unmatched-rule',
			path: 'GET /me',
			message:
				'no route of the app takes this rule, so the routes it was written for are left to `unmatched`',
			fix: expect.stringContaining('pattern'),
		});
	});

	test('a rung code outside auth.errors. is a rung-code issue', () => {
		const bad = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { '/a/:id': { GET: rung('app.errors.nope') as never } },
			}),
		);
		const issues = checkRoutes(bad, alxia().get('/a/:id', ok));
		expect(issues.map((i) => [i.kind, i.path])).toEqual([
			['rung-code', 'GET /a/:id'],
		]);
	});
});

describe('policyProblems with a rule for any method', () => {
	test('a `*` rule is reached when a route of any method takes it, and named by its flat key otherwise', () => {
		const rules = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'* /admin/*': { authenticated: true },
					'* /gone/*': { authenticated: true },
				},
			}),
		);
		const problems = policyProblems(rules, alxia().post('/admin/*', ok));
		expect(problems).toHaveLength(1);
		expect(problems[0]).toStartWith('* /gone/*: no route of the app takes');
	});

	test('a rung code outside auth.errors. is named with the flat key of a wildcard rule', () => {
		const rules = rest({ '/files/:id': { '*': rung('nope') } });
		expect(rungCodeProblems(rules)[0]).toStartWith('* /files/:id:');
	});
});
