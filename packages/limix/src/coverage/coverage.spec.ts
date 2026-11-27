import { describe, expect, it } from 'bun:test';
import { policyOf } from '../evaluation/evaluation.fixtures';
import { evaluateRest } from '../evaluation/rest';
import { rest, statuses } from './coverage.fixtures';
import { coverage } from './index';

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
			open: 0,
			byPattern: 0,
			byWildcard: 0,
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

	it('reaches a rule through its matcher when the spelling differs, and uses the rule', () => {
		const report = coverage(policy, [
			rest('GET', '/things/{id}'),
			rest('GET', '/things/:docId'),
			rest('GET', '/things/:id'),
		]);
		expect(report.operations.map((entry) => entry.match)).toEqual([
			'pattern',
			'pattern',
			'exact',
		]);
		expect(statuses(report)).toEqual([
			'GET /things/{id} covered',
			'GET /things/:docId covered',
			'GET /things/:id covered',
		]);
		expect(report.stale.map((rule) => rule.label)).not.toContain(
			'GET /things/:id',
		);
		expect(report.summary.byPattern).toBe(2);
	});

	it('reaches a rule by its matcher behind the basePath too, and for a public rule', () => {
		const report = coverage(policy, [
			rest('GET', '/api/things/{id}'),
			rest('GET', '/status'),
		]);
		expect(report.operations[0]).toMatchObject({
			status: 'covered',
			match: 'pattern',
		});
		expect(report.operations[1]).toMatchObject({
			status: 'public',
			match: 'exact',
		});
	});

	it('agrees with evaluateRest on the same inputs', async () => {
		const inputs = [
			'/things',
			'/things/:id',
			'/things/{id}',
			'/things/:docId',
			'/api/things/{id}',
			'/other',
		];
		const report = coverage(
			policy,
			inputs.map((path) => rest('GET', path)),
		);
		for (const [index, path] of inputs.entries()) {
			const decision = await evaluateRest(policy, {
				method: 'GET',
				route: path,
				// A request path carries the basePath.
				path: path.startsWith('/api') ? path : `/api${path}`,
				claims: { authenticated: true },
			});
			const entry = report.operations[index];
			// Reached by a rule: not the `unmatched: deny` refusal of the policy.
			expect(entry?.status !== 'uncovered').toBe(decision.allow);
		}
		// The matcher-reached rule is enforced, so it is not stale.
		expect(report.stale.map((rule) => rule.label)).not.toContain(
			'GET /things/:id',
		);
	});

	it('agrees with evaluateRest on the request path alone', async () => {
		const inputs = [
			['/things', '/api/things'],
			['/things/{id}', '/api/things/7'],
			['/things/:docId', '/api/things/7'],
			['/other', '/api/other'],
		] as const;
		const report = coverage(
			policy,
			inputs.map(([operation]) => rest('GET', operation)),
		);
		for (const [index, [, path]] of inputs.entries()) {
			const decision = await evaluateRest(policy, {
				method: 'GET',
				path,
				claims: { authenticated: true },
			});
			expect(report.operations[index]?.status !== 'uncovered').toBe(
				decision.allow,
			);
		}
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

describe('coverage: operations a pattern hit leaves partly open', () => {
	const files = policyOf({
		global: { unmatched: 'deny' },
		rest: {
			'/files/:name': { GET: { authenticated: true } },
			'/things/:id': { GET: { authenticated: true } },
		},
	});

	it('refuses a wildcard or an optional group, keeps a single parameter', () => {
		const report = coverage(files, [
			rest('GET', '/files/*path'),
			rest('GET', '/things{/:id}'),
			rest('GET', '/things/:thingId'),
		]);
		expect(statuses(report)).toEqual([
			'GET /files/*path uncovered',
			'GET /things{/:id} uncovered',
			'GET /things/:thingId covered',
		]);
		expect(report.operations[2]?.match).toBe('pattern');
		expect(report.operations[0]?.unmatched).toBe('deny');
	});

	it('leaves the rule stale only when no other operation uses it', () => {
		const alone = coverage(files, [
			rest('GET', '/files/*path'),
			rest('GET', '/things/:id'),
		]);
		expect(alone.stale.map((rule) => rule.label)).toEqual(['GET /files/:name']);
		const shared = coverage(files, [
			rest('GET', '/files/*path'),
			rest('GET', '/files/:name'),
			rest('GET', '/things/:id'),
		]);
		expect(shared.stale).toEqual([]);
	});

	it('agrees with evaluateRest on a concrete request path', async () => {
		// Under `allow`, a request no rule names is let through: an anonymous
		// caller is refused exactly where coverage says covered.
		const open = policyOf({
			global: { unmatched: 'allow' },
			rest: {
				'/files/:name': { GET: { authenticated: true } },
				'/things/:id': { GET: { authenticated: true } },
			},
		});
		const cases = [
			{ operation: '/files/*path', request: '/files/a/b' },
			{ operation: '/things/:thingId', request: '/things/42' },
		];
		const report = coverage(
			open,
			cases.map(({ operation }) => rest('GET', operation)),
		);
		for (const [index, { request }] of cases.entries()) {
			const decision = await evaluateRest(open, {
				method: 'GET',
				path: request,
				claims: {},
			});
			expect(report.operations[index]?.status === 'covered').toBe(
				!decision.allow,
			);
		}
	});
});
