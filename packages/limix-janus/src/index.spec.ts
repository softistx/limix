import { expect, test } from 'bun:test';
import pkg from '../package.json';
import type { CheckIssue, JanusRelationsOptions, ModelLike } from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual([
		'checkRulesAgainstModel',
		'janusRelations',
	]);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [CheckIssue, JanusRelationsOptions, ModelLike];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual(['.', './package.json']);
});
