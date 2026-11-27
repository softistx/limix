import { expect, test } from 'bun:test';
import type { GraphqlOperationsOptions } from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual(['graphqlOperations']);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [GraphqlOperationsOptions];
