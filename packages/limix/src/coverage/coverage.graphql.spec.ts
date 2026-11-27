import { describe, expect, it } from 'bun:test';
import { policyOf } from '../evaluation/evaluation.fixtures';
import { field, rest, statuses } from './coverage.fixtures';
import { coverage, type Operation } from './index';

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
		expect(report.stale.map((rule) => rule.label)).toEqual(['Mutation.retire']);
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
				open: 0,
				byPattern: 0,
				byWildcard: 0,
				stale: 0,
			},
		});
	});

	it('refuses malformed operations at the type level', () => {
		const accepts = (_operations: readonly Operation[]) => undefined;
		// @ts-expect-error a string is not an operation
		accepts(['GET /a']);
		// @ts-expect-error a REST operation needs a `path`
		accepts([{ kind: 'rest', method: 'GET' }]);
		// @ts-expect-error a GraphQL operation needs a `root`
		accepts([{ kind: 'graphql', type: 'Query', field: 'me' }]);
	});

	it('throws when operations is not an array', () => {
		for (const value of [undefined, null, 'GET /a', { length: 0 }]) {
			expect(() => coverage(policy, value as never)).toThrow(
				'coverage: `operations` must be an array',
			);
		}
	});

	it('counts the uncovered entries unmatched: allow leaves open', () => {
		const open = policyOf({ global: { unmatched: 'allow' } });
		const report = coverage(open, [
			rest('GET', '/b'),
			field('User', 'name', false),
		]);
		expect(report.summary).toMatchObject({ open: 2, refused: 0 });
	});

	it('throws on a value that is not an operation', () => {
		const bad = (value: unknown) => coverage(policy, [value as Operation]);
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
