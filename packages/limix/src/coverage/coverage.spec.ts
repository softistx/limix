import { describe, expect, it } from 'bun:test';
import { policyOf } from '../evaluation/evaluation.fixtures';
import { coverage, type Operation } from './index';

const rest = (method: string, path: string): Operation => ({
	kind: 'rest',
	method,
	path,
});
const field = (type: string, name: string, root = true): Operation => ({
	kind: 'graphql',
	type,
	field: name,
	root,
});
const statuses = (report: ReturnType<typeof coverage>) =>
	report.operations.map((entry) => `${entry.label} ${entry.status}`);

describe('coverage: REST', () => {
	const policy = policyOf({
		global: { unmatched: 'deny', basePath: '/api' },
		rest: {
			'/things': { GET: { authenticated: true } },
			'/things/:id': {
				GET: { authenticated: true },
				DELETE: { roles: [['admin']] },
			},
			'/status': { GET: { public: true } },
			'/retired': { GET: { authenticated: true } },
		},
	});

	it('sorts operations into covered, public and uncovered, and names the stale rules', () => {
		const report = coverage(policy, [
			rest('GET', '/things'),
			rest('GET', '/things/:id'),
			rest('GET', '/status'),
			rest('PUT', '/things/:id'),
			rest('GET', '/other'),
		]);
		expect(statuses(report)).toEqual([
			'GET /things covered',
			'GET /things/:id covered',
			'GET /status public',
			'PUT /things/:id uncovered',
			'GET /other uncovered',
		]);
		expect(report.operations[3]?.unmatched).toBe('deny');
		expect(report.operations[0]?.unmatched).toBeUndefined();
		expect(report.stale.map((rule) => rule.label)).toEqual([
			'GET /retired',
			'DELETE /things/:id',
		]);
		expect(report.summary).toEqual({
			total: 5,
			covered: 2,
			public: 1,
			uncovered: 2,
			refused: 2,
			stale: 2,
		});
	});

	it('reports what an uncovered operation falls to when unmatched is allow', () => {
		const open = policyOf({
			global: { unmatched: 'allow' },
			rest: { '/a': { GET: { public: true } } },
		});
		const report = coverage(open, [rest('GET', '/b')]);
		expect(report.operations[0]).toMatchObject({
			status: 'uncovered',
			unmatched: 'allow',
		});
		expect(report.summary.refused).toBe(0);
	});

	it('takes the path with or without the basePath, and the method in any case', () => {
		const report = coverage(policy, [
			rest('get', '/things'),
			rest('GET', '/api/things'),
		]);
		expect(report.operations.map((entry) => entry.status)).toEqual([
			'covered',
			'covered',
		]);
	});

	it('reads a route written differently from the rule as uncovered, and the rule as stale', () => {
		const report = coverage(policy, [rest('GET', '/things/{id}')]);
		expect(statuses(report)).toEqual(['GET /things/{id} uncovered']);
		expect(report.stale.map((rule) => rule.label)).toContain('GET /things/:id');
	});

	it('does not let a literal rule cover a parametrised operation', () => {
		const literal = policyOf({
			global: { unmatched: 'deny' },
			rest: { '/users/me': { GET: { public: true } } },
		});
		const report = coverage(literal, [rest('GET', '/users/:id')]);
		expect(report.operations[0]?.status).toBe('uncovered');
		expect(report.stale).toHaveLength(1);
	});

	it('lets a HEAD operation face the GET rule, as evaluateRest does', () => {
		const report = coverage(policy, [rest('HEAD', '/things')]);
		expect(report.operations[0]?.status).toBe('covered');
		expect(report.stale.map((rule) => rule.label)).not.toContain('GET /things');
	});

	it('is public for a HEAD only when every rule it faces is public', () => {
		const mixed = policyOf({
			global: { unmatched: 'deny' },
			rest: { '/a': { HEAD: { authenticated: true }, GET: { public: true } } },
		});
		expect(coverage(mixed, [rest('HEAD', '/a')]).operations[0]?.status).toBe(
			'covered',
		);
		expect(coverage(mixed, [rest('GET', '/a')]).operations[0]?.status).toBe(
			'public',
		);
	});

	it('leaves a HEAD-only rule uncovered: the handler has none, as the guard refuses it', () => {
		const headOnly = policyOf({
			global: { unmatched: 'deny' },
			rest: { '/a': { HEAD: { authenticated: true } } },
		});
		const report = coverage(headOnly, [rest('HEAD', '/a')]);
		expect(report.operations[0]).toMatchObject({
			status: 'uncovered',
			unmatched: 'deny',
		});
		expect(report.stale).toEqual([]);
	});
});

describe('coverage: GraphQL', () => {
	const policy = policyOf({
		global: { unmatched: 'deny' },
		graphql: {
			Query: { me: { authenticated: true }, ping: { public: true } },
			Mutation: { retire: { authenticated: true } },
			User: { email: { authenticated: true } },
			RootQuery: { who: { authenticated: true } },
		},
	});

	it('sorts fields into covered, public and uncovered, and names the stale rules', () => {
		const report = coverage(policy, [
			field('Query', 'me'),
			field('Query', 'ping'),
			field('Query', 'secret'),
			field('User', 'email', false),
			field('User', 'name', false),
		]);
		expect(statuses(report)).toEqual([
			'Query.me covered',
			'Query.ping public',
			'Query.secret uncovered',
			'User.email covered',
			'User.name uncovered',
		]);
		// Only a root field is refused by unmatched: deny.
		expect(report.operations[2]?.unmatched).toBe('deny');
		expect(report.operations[4]?.unmatched).toBe('allow');
		expect(report.stale.map((rule) => rule.label)).toEqual([
			'Mutation.retire',
		]);
	});

	it('honours a renamed root through the root flag', () => {
		const report = coverage(policy, [
			field('RootQuery', 'who'),
			field('RootQuery', 'other'),
		]);
		expect(report.operations[1]).toMatchObject({
			status: 'uncovered',
			unmatched: 'deny',
		});
		// `RootQuery` is judged because the list names it; the default roots too.
		expect(report.stale.map((rule) => rule.label).sort()).toEqual([
			'Mutation.retire',
			'Query.me',
			'Query.ping',
		]);
	});

	it('does not read a prototype key as a rule', () => {
		const report = coverage(policy, [field('Query', 'constructor')]);
		expect(report.operations[0]?.status).toBe('uncovered');
	});

	it('judges a type only when the list names it, or it is a default root', () => {
		const report = coverage(policy, [field('Query', 'me')]);
		expect(report.stale.map((rule) => rule.label).sort()).toEqual([
			'Mutation.retire',
			'Query.ping',
		]);
	});
});

describe('coverage: both transports', () => {
	const policy = policyOf({
		global: { unmatched: 'deny' },
		rest: { '/a': { GET: { public: true } } },
		graphql: { Query: { me: { public: true } } },
	});

	it('judges a transport only when the list holds an operation of it', () => {
		expect(coverage(policy, [field('Query', 'me')]).stale).toEqual([]);
		expect(coverage(policy, [rest('GET', '/a')]).stale).toEqual([]);
	});

	it('returns an empty report for an empty list', () => {
		expect(coverage(policy, [])).toEqual({
			operations: [],
			stale: [],
			summary: {
				total: 0,
				covered: 0,
				public: 0,
				uncovered: 0,
				refused: 0,
				stale: 0,
			},
		});
	});

	it('throws on a value that is not an operation', () => {
		const bad = (value: unknown) =>
			coverage(policy, [value as Operation]);
		for (const value of [
			null,
			'GET /a',
			{ kind: 'rest', method: 'GET' },
			{ kind: 'graphql', type: 'Query', field: 'me' },
			{ kind: 'sql' },
		]) {
			expect(() => bad(value)).toThrow(
				"coverage: operation 0 must be { kind: 'rest', method, path } or { kind: 'graphql', type, field, root }",
			);
		}
	});
});
