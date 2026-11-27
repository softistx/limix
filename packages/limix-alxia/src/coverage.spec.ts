import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { coverage } from '@softistx/limix/coverage';
import { ok, policy, routesOn } from './app.fixtures';
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
