import { describe, expect, it } from 'bun:test';
import { anonymous, policyOf, user } from '../evaluation/evaluation.fixtures';
import { explain } from '../evaluation/explain';
import { rest } from './coverage.fixtures';
import { coverage } from './index';

type Rest = Record<string, Record<string, Record<string, unknown>>>;

const denied = (rules: Rest, basePath?: string) =>
	policyOf({
		global: { unmatched: 'deny', ...(basePath ? { basePath } : {}) },
		rest: rules as never,
	});

/**
 * Coverage on the operation and `evaluateRest` three ways (the concrete path,
 * the route, both), anonymous: all four must name the same rule.
 */
async function agree(
	policy: ReturnType<typeof denied>,
	method: string,
	operation: string,
	request: string,
	expected: { status: 'public' | 'covered'; rule: string },
) {
	const report = coverage(policy, [rest(method, operation)]);
	const entry = report.operations[0];
	expect(entry?.status).toBe(expected.status);
	const inputs = [
		{ path: request },
		{ route: operation },
		{ route: operation, path: request },
	];
	for (const input of inputs) {
		const result = await explain(policy, {
			method,
			claims: anonymous,
			...input,
		});
		expect(result.decision.allow).toBe(expected.status === 'public');
		if (!result.decision.allow) {
			expect(result.decision.refusal.status).toBe(401);
		}
		const matches = result.steps.filter((step) => step.kind === 'match');
		expect(matches.at(-1)?.label).toBe(expected.rule);
	}
}

describe('coverage and evaluateRest agree on overlapping patterns', () => {
	it('param before static', async () => {
		const policy = denied({
			'/notes/:id': { GET: { authenticated: true } },
			'/notes/new': { GET: { public: true } },
		});
		await agree(policy, 'GET', '/notes/new', '/notes/new', {
			status: 'covered',
			rule: 'GET /notes/:id',
		});
	});

	it('wildcard before static', async () => {
		const policy = denied({
			'/files/*path': { GET: { authenticated: true } },
			'/files/readme': { GET: { public: true } },
		});
		await agree(policy, 'GET', '/files/readme', '/files/readme', {
			status: 'covered',
			rule: 'GET /files/*path',
		});
	});

	it('optional group before static', async () => {
		const policy = denied({
			'/things{/:id}': { GET: { authenticated: true } },
			'/things/new': { GET: { public: true } },
		});
		await agree(policy, 'GET', '/things/new', '/things/new', {
			status: 'covered',
			rule: 'GET /things{/:id}',
		});
	});

	it('HEAD, through the GET rules', async () => {
		const policy = denied({
			'/notes/:id': { GET: { authenticated: true } },
			'/notes/new': { GET: { public: true } },
		});
		await agree(policy, 'HEAD', '/notes/new', '/notes/new', {
			status: 'covered',
			rule: 'HEAD /notes/:id',
		});
	});

	it('HEAD with a HEAD rule of its own', async () => {
		const policy = denied({
			'/notes/:id': { HEAD: { authenticated: true }, GET: { public: true } },
			'/notes/new': { HEAD: { public: true }, GET: { public: true } },
		});
		await agree(policy, 'HEAD', '/notes/new', '/notes/new', {
			status: 'covered',
			rule: 'HEAD /notes/:id',
		});
	});

	it('behind a basePath, with either spelling of the operation', async () => {
		const policy = denied(
			{
				'/notes/:id': { GET: { authenticated: true } },
				'/notes/new': { GET: { public: true } },
			},
			'/api',
		);
		for (const operation of ['/notes/new', '/api/notes/new']) {
			await agree(policy, 'GET', operation, '/api/notes/new', {
				status: 'covered',
				rule: 'GET /api/notes/:id',
			});
		}
	});

	it('a parameter before another of a different name', async () => {
		const policy = denied({
			'/notes/:id': { GET: { authenticated: true } },
			'/notes/:slug': { GET: { public: true } },
		});
		await agree(policy, 'GET', '/notes/:slug', '/notes/abc', {
			status: 'covered',
			rule: 'GET /notes/:id',
		});
	});

	it('a parameter segment before a static one', async () => {
		const policy = denied({
			'/:org/notes': { GET: { authenticated: true } },
			'/me/notes': { GET: { public: true } },
		});
		await agree(policy, 'GET', '/me/notes', '/me/notes', {
			status: 'covered',
			rule: 'GET /:org/notes',
		});
	});

	it('static before param keeps both rules', async () => {
		const policy = denied({
			'/notes/new': { GET: { public: true } },
			'/notes/:id': { GET: { authenticated: true } },
		});
		await agree(policy, 'GET', '/notes/new', '/notes/new', {
			status: 'public',
			rule: 'GET /notes/new',
		});
		await agree(policy, 'GET', '/notes/:id', '/notes/42', {
			status: 'covered',
			rule: 'GET /notes/:id',
		});
	});

	it('a parameter before a wildcard keeps the wildcard operation on the wildcard rule', async () => {
		const policy = denied({
			'/files/:name': { GET: { authenticated: true } },
			'/files/*path': { GET: { public: true } },
		});
		const report = coverage(policy, [rest('GET', '/files/*path')]);
		expect(report.operations[0]).toMatchObject({
			status: 'public',
			match: 'exact',
		});
	});

	it('an OpenAPI brace operation reaches the parameter rule', async () => {
		const policy = denied({ '/docs/:id': { GET: { authenticated: true } } });
		await agree(policy, 'GET', '/docs/{id}', '/docs/1', {
			status: 'covered',
			rule: 'GET /docs/:id',
		});
	});
});

describe('coverage: a rule an earlier one shadows', () => {
	const staleOf = (rules: Rest) =>
		coverage(denied(rules), [
			rest('GET', '/notes/new'),
			rest('GET', '/notes/:id'),
			rest('GET', '/files/readme'),
			rest('GET', '/things/new'),
			rest('GET', '/tags/:slug'),
		]).stale;

	it('names the earlier rule', () => {
		const stale = staleOf({
			'/notes/:id': { GET: { authenticated: true } },
			'/notes/new': { GET: { public: true } },
			'/files/*path': { GET: { authenticated: true } },
			'/files/readme': { GET: { public: true } },
			'/things{/:id}': { GET: { authenticated: true } },
			'/things/new': { GET: { public: true } },
			'/tags/:id': { GET: { authenticated: true } },
			'/tags/:slug': { GET: { public: true } },
		});
		const shadowed = Object.fromEntries(
			stale.flatMap((rule) =>
				rule.kind === 'rest' && rule.shadowedBy
					? [[rule.label, rule.shadowedBy.label]]
					: [],
			),
		);
		expect(shadowed).toEqual({
			'GET /notes/new': 'GET /notes/:id',
			'GET /files/readme': 'GET /files/*path',
			'GET /things/new': 'GET /things{/:id}',
			'GET /tags/:slug': 'GET /tags/:id',
		});
	});

	it('reports nothing for static before param', () => {
		const stale = staleOf({
			'/notes/new': { GET: { public: true } },
			'/notes/:id': { GET: { authenticated: true } },
			'/legacy': { GET: { public: true } },
		});
		expect(stale.map((rule) => rule.label)).toEqual(['GET /legacy']);
		expect(stale.some((rule) => rule.kind === 'rest' && rule.shadowedBy)).toBe(
			false,
		);
	});

	it('reports none on a pattern that opens', () => {
		const stale = coverage(
			denied({
				'/files/:name': { GET: { authenticated: true } },
				'/files/*path': { GET: { public: true } },
			}),
			[rest('GET', '/files/a')],
		).stale;
		expect(stale).toEqual([
			expect.not.objectContaining({ shadowedBy: expect.anything() }),
		]);
	});

	it('strips the basePath from the shadowing rule', () => {
		const policy = denied(
			{
				'/notes/:id': { GET: { authenticated: true } },
				'/notes/new': { GET: { public: true } },
			},
			'/api',
		);
		const stale = coverage(policy, [rest('GET', '/notes/:id')]).stale;
		expect(stale).toEqual([
			{
				kind: 'rest',
				method: 'GET',
				path: '/notes/new',
				label: 'GET /notes/new',
				shadowedBy: { path: '/notes/:id', label: 'GET /notes/:id' },
			},
		]);
	});
});

describe('a route is matched through a stand-in, every alternative', () => {
	it('an escaped literal rule before a param rule takes no route of the param', async () => {
		const policy = denied({
			'/notes/\\:slug': { GET: { public: true } },
			'/notes/:slug': { GET: { authenticated: true } },
		});
		const result = await explain(policy, {
			method: 'GET',
			route: '/notes/:slug',
			claims: anonymous,
		});
		if (result.decision.allow) throw new Error('expected a refusal');
		expect(result.decision.refusal.status).toBe(401);
		const report = coverage(policy, [rest('GET', '/notes/:slug')]);
		expect(report.operations[0]).toMatchObject({
			status: 'covered',
			match: 'exact',
		});
		expect(report.stale.some((r) => r.kind === 'rest' && r.shadowedBy)).toBe(
			false,
		);
	});

	it('a rule before a plain-text optional group takes only part of it', () => {
		for (const [first, later, operation] of [
			['/a:x', '/a{b}', '/a{b}'],
			['/:a/:b', '/x{/y}', '/x{/y}'],
		] as const) {
			const policy = denied({
				[first]: { GET: { authenticated: true } },
				[later]: { GET: { public: true } },
			});
			const report = coverage(policy, [rest('GET', operation)]);
			expect(report.operations[0]?.status).toBe('public');
			expect(report.stale.some((r) => r.kind === 'rest' && r.shadowedBy)).toBe(
				false,
			);
		}
	});

	it('a bare % in a rule does not throw coverage, and a route falls to unmatched', async () => {
		const policy = denied({ '/n/%': { GET: { public: true } } });
		expect(() => coverage(policy, [rest('GET', '/n/:id')])).not.toThrow();
		const result = await explain(policy, {
			method: 'GET',
			route: '/n/%E0',
			claims: anonymous,
		});
		expect(result.decision.allow).toBe(false);
	});

	it('an escaped literal route keeps the params it captures', async () => {
		const seen: unknown[] = [];
		const policy = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/n/:id': { GET: { when: ['see'] } } },
			},
			{
				see: ({ request }) => {
					seen.push((request as { params: unknown }).params);
					return true;
				},
			},
		);
		await explain(policy, {
			method: 'GET',
			route: '/n/\\:x',
			claims: user(),
		});
		expect(seen).toEqual([{ id: ':x' }]);
	});
});
