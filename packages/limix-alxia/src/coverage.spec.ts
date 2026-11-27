import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { coverage } from '@softistx/limix/coverage';
import { call, ok, policy, routesOn, whoOf } from './app.fixtures';
import { limixGuard } from './guard';
import { alxiaOperations } from './operations';

describe('alxiaOperations with coverage()', () => {
	test('every route of an app the policy fits is covered, HEAD through its GET rule', () => {
		const report = coverage(policy, alxiaOperations(routesOn(alxia())));
		expect(report.summary).toMatchObject({ uncovered: 0, stale: 0 });
		expect(report.summary.public).toBe(2);
		const head = report.operations.find((o) => o.label === 'HEAD /files/*path');
		expect(head?.status).toBe('covered');
	});

	test('a route no rule names is uncovered and refused under deny', () => {
		const app = routesOn(alxia()).get('/forgotten/:id', ok);
		const report = coverage(policy, alxiaOperations(app));
		const lost = report.operations.filter((o) => o.status === 'uncovered');
		expect(lost.map((o) => o.label)).toEqual([
			'GET /forgotten/:id',
			'HEAD /forgotten/:id',
		]);
		expect(report.summary.refused).toBe(2);
	});

	test('a rule for a route the app lacks is stale', () => {
		const report = coverage(policy, alxiaOperations(alxia().get('/open', ok)));
		expect(report.stale.length).toBe(5);
	});
});

describe('alxiaOperations with coverage(), overlapping routes', () => {
	const overlapping = compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'/notes/:id': { GET: { authenticated: true } },
				'/notes/new': { GET: { public: true } },
			},
		}),
	);
	const app = alxia().get('/notes/:id', ok).get('/notes/new', ok);

	test('reports the rule the guard applies, and the one it shadows', () => {
		const report = coverage(overlapping, alxiaOperations(app));
		expect(
			report.operations
				.filter((o) => o.label === 'GET /notes/new')
				.map((o) => o.status),
		).toEqual(['covered']);
		expect(report.stale).toEqual([
			{
				kind: 'rest',
				method: 'GET',
				path: '/notes/new',
				label: 'GET /notes/new',
				shadowedBy: { path: '/notes/:id', label: 'GET /notes/:id' },
			},
		]);
	});

	test('the guard answers 401 to anonymous on /notes/new', async () => {
		const served = alxia();
		served.use(limixGuard({ policy: overlapping, claims: whoOf, app: served }));
		served.get('/notes/:id', ok).get('/notes/new', ok);
		expect((await call(served, '/notes/new')).status).toBe(401);
	});
});
