import { describe, expect, it } from 'bun:test';
import { definePolicy } from '../define';
import { RulesError } from '../error';
import { EXAMPLE_POLICY } from '../example.fixtures';
import { parseRules } from '../parse';
import { compilePolicy } from './index';

const workingHours = () => true;

describe('compilePolicy', () => {
	it('builds the REST route table by method, in document order, with basePath', () => {
		const policy = compilePolicy(EXAMPLE_POLICY, {
			conditions: { workingHours },
		});
		expect(policy.global).toEqual({ basePath: '/api', unmatched: 'deny' });
		expect([...policy.restRoutesByMethod.keys()].sort()).toEqual([
			'DELETE',
			'GET',
			'PUT',
		]);
		expect(policy.restRoutesByMethod.get('GET')?.map((r) => r.pattern)).toEqual(
			['/api/documents', '/api/health'],
		);
		const put = policy.restRoutesByMethod.get('PUT')?.[0];
		expect(put?.matcher('/api/documents/42')).toMatchObject({
			params: { id: '42' },
		});
		expect(put?.conditions).toEqual([workingHours]);
		expect(put?.readsBody).toBe(false);
	});

	it('builds the GraphQL field table', () => {
		const policy = compilePolicy(EXAMPLE_POLICY, {
			conditions: { workingHours },
		});
		expect(Object.keys(policy.graphql ?? {})).toEqual(['Query', 'Mutation']);
		expect(policy.graphql?.['Mutation']?.['updateNote']?.rule.roles).toEqual([
			['editor', 'reviewer'],
			['admin'],
		]);
	});

	it('flags a route whose relation reads the body', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: {
				'/a': {
					POST: {
						relations: [
							{
								require: [
									[{ relation: 'edit', type: 'doc', from: 'json.docId' }],
								],
							},
						],
					},
				},
			},
		});
		expect(
			compilePolicy(rules).restRoutesByMethod.get('POST')?.[0]?.readsBody,
		).toBe(true);
	});

	it('throws on an unknown condition name, listing every one with its path', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: { '/a': { GET: { when: ['known', 'nope'] } } },
			graphql: { Query: { a: { when: ['gone'] } } },
		});
		let error: unknown;
		try {
			compilePolicy(rules, { conditions: { known: () => true } });
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(RulesError);
		expect((error as RulesError).issues).toEqual([
			{
				path: "rest['/a'].GET.when[1]",
				message: 'unknown condition `nope`: registered known',
			},
			{
				path: 'graphql.Query.a.when[0]',
				message: 'unknown condition `gone`: registered known',
			},
		]);
	});

	it('does not take Object.prototype members for conditions', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: { '/a': { GET: { when: ['toString'] } } },
		});
		expect(() => compilePolicy(rules)).toThrow(
			/unknown condition `toString`: registered none/,
		);
	});

	it('refuses contradictory rules', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: { '/a': { GET: { public: true, authenticated: true } } },
			graphql: {
				Query: {
					a: {
						public: true,
						relations: [{ require: [[{ relation: 'view', type: 'doc' }]] }],
					},
				},
			},
		});
		expect(() => compilePolicy(rules)).toThrow(
			/`authenticated` and `public` are contradictory/,
		);
		expect(() => compilePolicy(rules)).toThrow(
			/`public` and `relations` are contradictory/,
		);
	});

	it('refuses public beside roles, permissions or when, REST and GraphQL', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: {
				'/a': { GET: { public: true, roles: [['admin']] } },
				'/b': { GET: { public: true, permissions: [['p']], when: ['c'] } },
			},
			graphql: { Query: { a: { public: true, roles: [['admin']] } } },
		});
		let error: unknown;
		try {
			compilePolicy(rules, { conditions: { c: () => true } });
		} catch (e) {
			error = e;
		}
		expect((error as RulesError).issues.map((i) => i.path)).toEqual([
			"rest['/a'].GET",
			"rest['/b'].GET",
			"rest['/b'].GET",
			'graphql.Query.a',
		]);
		expect((error as RulesError).issues.map((i) => i.message)).toEqual([
			expect.stringContaining('`public` and `roles` are contradictory'),
			expect.stringContaining('`public` and `permissions` are contradictory'),
			expect.stringContaining('`public` and `when` are contradictory'),
			expect.stringContaining('`public` and `roles` are contradictory'),
		]);
	});

	it('reports every invalid path pattern together with the other issues', () => {
		const rules = definePolicy({
			limix: 1,
			global: { unmatched: 'allow' },
			rest: {
				'/a/:': { GET: {} },
				'/ok': { GET: { when: ['gone'] } },
				'/b/(': { GET: {} },
			},
		});
		let error: unknown;
		try {
			compilePolicy(rules);
		} catch (e) {
			error = e;
		}
		expect(error).toBeInstanceOf(RulesError);
		const issues = (error as RulesError).issues;
		expect(issues.map((i) => i.path)).toEqual([
			"rest['/a/:']",
			"rest['/ok'].GET.when[0]",
			"rest['/b/(']",
		]);
		expect(issues[0]?.message).toStartWith('invalid path pattern: ');
		expect(issues[2]?.message).toStartWith('invalid path pattern: ');
	});

	describe('relation terms reading a path parameter', () => {
		const rules = (from?: string, path = '/docs/:id') =>
			definePolicy({
				limix: 1,
				global: { unmatched: 'allow' },
				rest: {
					[path]: {
						GET: {
							relations: [
								{
									require: [
										[
											{
												relation: 'view',
												type: 'doc',
												...(from ? { from } : {}),
											},
										],
									],
								},
							],
						},
					},
				},
			});

		it('refuses a `param.<name>` the pattern does not capture, with its path', () => {
			try {
				compilePolicy(rules('param.docId'));
				throw new Error('expected a RulesError');
			} catch (error) {
				expect(error).toBeInstanceOf(RulesError);
				expect((error as RulesError).issues).toEqual([
					{
						path: "rest['/docs/:id'].GET.relations[0].require[0][0].from",
						message:
							'`param.docId` names no parameter of the pattern: it captures id',
					},
				]);
			}
		});

		it('refuses the default `param.id` on a pattern with no :id', () => {
			expect(() => compilePolicy(rules(undefined, '/docs'))).toThrow(
				RulesError,
			);
		});

		it('accepts a captured name, a wildcard and a group', () => {
			expect(() => compilePolicy(rules('param.id'))).not.toThrow();
			expect(() =>
				compilePolicy(rules('param.rest', '/files/*rest')),
			).not.toThrow();
			expect(() =>
				compilePolicy(rules('param.ext', '/files{.:ext}')),
			).not.toThrow();
		});
	});

	describe('usesRelations', () => {
		const relations = [{ require: [[{ relation: 'view', type: 'doc' }]] }];
		const compile = (rest: object, graphql?: object) =>
			compilePolicy(
				definePolicy({
					limix: 1,
					global: { unmatched: 'allow' },
					rest,
					...(graphql ? { graphql } : {}),
				} as never),
			);

		it('is false when no rule declares relations', () => {
			expect(compile({ '/a': { GET: { public: true } } }).usesRelations).toBe(
				false,
			);
		});

		it('is true for a REST rule with relations', () => {
			expect(compile({ '/a/:id': { GET: { relations } } }).usesRelations).toBe(
				true,
			);
		});

		it('is true for a GraphQL field with relations', () => {
			const policy = compile(
				{},
				{
					Query: {
						a: {
							relations: [{ require: [[{ relation: 'view', type: 'doc' }]] }],
						},
					},
				},
			);
			expect(policy.usesRelations).toBe(true);
		});
	});
});

describe('a compiled rule is deep-readonly', () => {
	it('refuses to edit a list, a rung or a term', () => {
		const policy = compilePolicy(
			parseRules({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'/a/:id': {
						GET: {
							roles: [['admin']],
							relations: [{ require: [[{ relation: 'view', type: 'doc' }]] }],
						},
					},
				},
				graphql: { Query: { f: { permissions: [['p']] } } },
			}),
		);
		const route = policy.restRoutesByMethod.get('GET')?.[0];
		const entry = policy.graphql?.['Query']?.['f'];
		// @ts-expect-error a compiled list is readonly
		route?.rule.roles?.push(['x']);
		// @ts-expect-error a compiled rung's lists are readonly
		route?.rule.relations?.[0]?.require.push([]);
		// @ts-expect-error a compiled GraphQL rule's lists are readonly
		entry?.rule.permissions?.push(['x']);
		// @ts-expect-error a compiled term is readonly
		if (route?.rule.relations?.[0]) route.rule.relations[0].code = 'x';
	});
});
