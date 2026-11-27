import { expect, test } from 'bun:test';
import pkg from '../package.json';
import type { ModuleInput } from './index';
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

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [ModuleInput];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual([
		'.',
		'./graphql-codegen',
		'./package.json',
	]);
});
