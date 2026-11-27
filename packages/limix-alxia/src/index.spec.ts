import { expect, test } from 'bun:test';
import * as limixAlxia from './index';

test('exports the guard, the operations and the route checks, and no GraphQL', () => {
	expect(Object.keys(limixAlxia).sort()).toEqual([
		'alxiaOperations',
		'checkGuard',
		'checkRoutes',
		'limixGuard',
	]);
});
