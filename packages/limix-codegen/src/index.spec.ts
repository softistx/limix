import { expect, test } from 'bun:test';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual([
		'CodegenError',
		'generateModule',
		'openapiOperations',
		'openapiPath',
		'starterRules',
	]);
});
