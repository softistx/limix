import { describe, expect, it } from 'bun:test';
import { policyOf } from '../evaluation/evaluation.fixtures';
import { field, rest, statuses } from './coverage.fixtures';
import { coverage } from './index';

describe('coverage: wildcards', () => {
	const policy = policyOf({
		global: { unmatched: 'deny' },
		rest: {
			'GET /things/:id': { authenticated: true },
			'* /admin/*': { roles: [['admin']] },
			'/open': { '*': { public: true } },
		},
		graphql: {
			'Query.me': { authenticated: true },
			'Query.*': { roles: [['admin']] },
			'Note.title': { authenticated: true },
		},
	});

	it('reports match: wildcard for a method * rule, and for Type.*', () => {
		const report = coverage(policy, [
			rest('GET', '/things/:id'),
			rest('DELETE', '/admin/users'),
			rest('GET', '/open'),
			field('Query', 'me'),
			field('Query', 'users'),
			field('Note', 'title', false),
		]);
		expect(statuses(report)).toEqual([
			'GET /things/:id covered',
			'DELETE /admin/users covered',
			'GET /open public',
			'Query.me covered',
			'Query.users covered',
			'Note.title covered',
		]);
		expect(report.operations.map((entry) => entry.match)).toEqual([
			'exact',
			'wildcard',
			'wildcard',
			undefined,
			'wildcard',
			undefined,
		]);
		expect(report.summary).toMatchObject({ byWildcard: 3, byPattern: 0 });
	});

	it('gives the wildcard precedence over pattern and exact', () => {
		const report = coverage(
			policyOf({
				global: { unmatched: 'deny' },
				rest: { '* /a/:id': { authenticated: true } },
			}),
			[rest('GET', '/a/:id'), rest('GET', '/a/:other')],
		);
		expect(report.operations.map((entry) => entry.match)).toEqual([
			'wildcard',
			'wildcard',
		]);
	});

	it('does not count a wildcard as a gate failure: it is not byPattern', () => {
		const report = coverage(policy, [rest('PUT', '/admin/x')]);
		expect(report.summary.byPattern).toBe(0);
		expect(report.summary.byWildcard).toBe(1);
	});

	it('names a stale wildcard with its method *', () => {
		const report = coverage(policy, [rest('GET', '/things/:id')]);
		expect(report.stale.map((rule) => rule.label)).toEqual([
			'* /admin/*',
			'* /open',
		]);
		expect(report.stale[0]).toMatchObject({
			kind: 'rest',
			method: '*',
			path: '/admin/*',
		});
	});

	it('names flat keys in a stale label, as method and path', () => {
		const report = coverage(
			policyOf({
				global: { unmatched: 'deny' },
				rest: {
					'POST /gone': { public: true },
					'/old': { GET: { public: true } },
				},
			}),
			[rest('GET', '/x')],
		);
		expect(report.stale.map((rule) => rule.label)).toEqual([
			'POST /gone',
			'GET /old',
		]);
	});

	it('reports an exact rule after an earlier * of another key as shadowed by it', () => {
		const report = coverage(
			policyOf({
				global: { unmatched: 'deny' },
				rest: {
					'* /x/*': { roles: [['admin']] },
					'GET /x/:id': { public: true },
				},
			}),
			[rest('POST', '/x/y')],
		);
		const stale = report.stale.find((rule) => rule.label === 'GET /x/:id');
		expect(stale).toMatchObject({
			kind: 'rest',
			shadowedBy: { path: '/x/*', label: '* /x/*' },
		});
	});

	it('flags Type.* stale when every operation of a judged type has its own rule', () => {
		const stale = coverage(
			policyOf({
				global: { unmatched: 'deny' },
				graphql: { 'Query.me': { public: true }, 'Query.*': { public: true } },
			}),
			[field('Query', 'me')],
		).stale;
		expect(stale.map((rule) => rule.label)).toEqual(['Query.*']);
		const kept = coverage(
			policyOf({
				global: { unmatched: 'deny' },
				graphql: { 'Query.me': { public: true }, 'Query.*': { public: true } },
			}),
			[field('Query', 'me'), field('Query', 'other')],
		).stale;
		expect(kept).toEqual([]);
	});
});
