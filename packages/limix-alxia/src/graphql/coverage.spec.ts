import { describe, expect, test } from 'bun:test';
import { coverage } from '@softistx/limix/coverage';
import { graphqlOperations } from '@softistx/limix-graxia';
import { alxiaOperations } from '../operations';
import { gqlPolicy, graphqlApp, schema } from './graphql.fixtures';

describe('coverage over REST routes and GraphQL fields', () => {
	test('the endpoint is no REST operation, its fields are the GraphQL ones', () => {
		const { app } = graphqlApp();
		const operations = [
			...alxiaOperations(app),
			...graphqlOperations(schema()),
		];
		const report = coverage(gqlPolicy, operations);
		expect(report.operations.map((o) => o.label)).toEqual([
			'GET /open',
			'HEAD /open',
			'Query.open',
			'Query.me',
			'Query.secret',
			'Query.note',
			'Query.other',
		]);
		expect(report.summary).toMatchObject({
			uncovered: 1,
			refused: 1,
			stale: 0,
		});
		expect(report.operations.find((o) => o.status === 'uncovered')?.label).toBe(
			'Query.other',
		);
	});
});
