import { describe, expect, it } from 'bun:test';
import { RulesError } from './error';
import { parseRules } from './parse';
import type { RestMethods } from './types';

const base = { limix: 1 as const, global: { unmatched: 'allow' as const } };

function issuesOf(input: unknown): { path: string; message: string }[] {
	try {
		parseRules(input);
	} catch (error) {
		if (error instanceof RulesError) return [...error.issues];
		throw error;
	}
	throw new Error('expected parseRules to throw');
}

describe('parseRules', () => {
	it('returns a valid document', () => {
		const rules = parseRules({
			...base,
			rest: { '/a': { GET: { roles: [['admin']], when: ['open'] } } },
		});
		expect((rules.rest?.['/a'] as RestMethods | undefined)?.GET?.roles).toEqual(
			[['admin']],
		);
	});

	it('drops x- keys and refuses any other unknown top-level key', () => {
		expect(parseRules({ ...base, 'x-common': { a: 1 } })).toEqual(base);
		expect(issuesOf({ ...base, rule: {} })).toEqual([
			{ path: 'rule', message: 'unknown key `rule`' },
		]);
	});

	it('requires limix: 1 and global.unmatched', () => {
		expect(
			issuesOf({ global: { unmatched: 'allow' } }).map((i) => i.path),
		).toEqual(['limix']);
		expect(
			issuesOf({ limix: 2, global: { unmatched: 'allow' } }).map((i) => i.path),
		).toEqual(['limix']);
		expect(issuesOf({ limix: 1, global: {} }).map((i) => i.path)).toEqual([
			'global.unmatched',
		]);
		expect(issuesOf({ limix: 1 }).map((i) => i.path)).toEqual(['global']);
		expect(
			issuesOf({ limix: 1, global: { unmatched: 'maybe' } })[0]?.path,
		).toBe('global.unmatched');
	});

	it('lists every issue with its path', () => {
		const issues = issuesOf({
			limix: 1,
			global: {},
			rest: { '/a': { GTE: {}, GET: { roles: [] } } },
		});
		expect(issues.map((i) => i.path).sort()).toEqual(
			['global.unmatched', "rest['/a'].GET.roles", "rest['/a'].GTE"].sort(),
		);
	});

	it('refuses empty alternatives and empty lists in every DNF term', () => {
		for (const term of ['roles', 'permissions']) {
			expect(
				issuesOf({ ...base, rest: { '/a': { GET: { [term]: [[]] } } } })[0]
					?.path,
			).toBe(`rest['/a'].GET.${term}[0]`);
			expect(
				issuesOf({ ...base, rest: { '/a': { GET: { [term]: [] } } } })[0]?.path,
			).toBe(`rest['/a'].GET.${term}`);
		}
	});

	it("refuses the other transport's id grammar in relations", () => {
		const term = { relation: 'view', type: 'doc', from: 'args.id' };
		const issues = issuesOf({
			...base,
			rest: { '/a/:id': { GET: { relations: [{ require: [[term]] }] } } },
		});
		expect(issues[0]?.path).toBe(
			"rest['/a/:id'].GET.relations[0].require[0][0].from",
		);
		const gql = issuesOf({
			...base,
			graphql: {
				Query: {
					doc: { relations: [{ require: [[{ ...term, from: 'param.id' }]] }] },
				},
			},
		});
		expect(gql[0]?.path).toBe(
			'graphql.Query.doc.relations[0].require[0][0].from',
		);
	});

	describe('removed keys say what to use instead', () => {
		const rule = (extra: object) => ({
			...base,
			rest: { '/a': { GET: extra } },
		});
		const cases: [string, object, string, RegExp][] = [
			['keto', { keto: [] }, "rest['/a'].GET.keto", /use relations/],
			[
				'authorities',
				{ authorities: [['A']] },
				"rest['/a'].GET.authorities",
				/use roles/,
			],
			[
				'expression',
				{ expression: { value: 'true' } },
				"rest['/a'].GET.expression",
				/when: \[name\]/,
			],
			['cors', { cors: {} }, "rest['/a'].GET.cors", /never enforced/],
			[
				'rateLimit',
				{ rateLimit: {} },
				"rest['/a'].GET.rateLimit",
				/never enforced/,
			],
		];
		for (const [key, extra, path, message] of cases) {
			it(key, () => {
				const [issue] = issuesOf(rule(extra));
				expect(issue?.path).toBe(path);
				expect(issue?.message).toMatch(message);
			});
		}

		it('keto on a GraphQL rule', () => {
			const [issue] = issuesOf({
				...base,
				graphql: { Query: { a: { keto: [] } } },
			});
			expect(issue).toEqual({
				path: 'graphql.Query.a.keto',
				message: '`keto` is removed: use relations',
			});
		});

		it('global.providers, global.cors and global.rateLimit', () => {
			const issues = issuesOf({
				limix: 1,
				global: { unmatched: 'allow', providers: [], cors: {}, rateLimit: {} },
			});
			expect(issues.map((i) => i.path)).toEqual([
				'global.providers',
				'global.cors',
				'global.rateLimit',
			]);
			expect(issues.every((i) => /never enforced/.test(i.message))).toBe(true);
		});

		it('namespace and id on a relation term', () => {
			const term = { relation: 'view', namespace: 'doc', id: 'param.id' };
			const issues = issuesOf({
				...base,
				rest: { '/a': { GET: { relations: [{ require: [[term]] }] } } },
			});
			expect(issues.map((i) => i.message)).toEqual([
				'Invalid input: expected string, received undefined',
				'`namespace` is renamed: use type',
				'`id` is renamed: use from',
			]);
		});
	});

	it('message on a relation rung, renamed code', () => {
		const rung = {
			require: [[{ relation: 'view', type: 'doc' }]],
			message: 'x',
		};
		expect(
			issuesOf({
				...base,
				rest: { '/a': { GET: { relations: [rung] } } },
			}).map((issue) => issue.message),
		).toEqual(["`message` is renamed `code`: it is the refusal's code"]);
	});

	it('names the source in the error when given', () => {
		try {
			parseRules({}, 'rules.yaml');
		} catch (error) {
			expect((error as Error).message).toContain(
				'Invalid rules in rules.yaml: 2 issues',
			);
		}
	});

	it('refuses a `$` in a role name with a hint', () => {
		expect(
			issuesOf({
				...base,
				rest: { '/a': { GET: { roles: [['admin'], ['editor', '$domain']] } } },
				graphql: { Query: { a: { roles: [['$domain:admin']] } } },
			}),
		).toEqual([
			{
				path: "rest['/a'].GET.roles[1][1]",
				message: '`$domain` is removed: per-tenant roles are not in 1.0',
			},
			{
				path: 'graphql.Query.a.roles[0][0]',
				message: '`$domain` is removed: per-tenant roles are not in 1.0',
			},
		]);
	});
});
