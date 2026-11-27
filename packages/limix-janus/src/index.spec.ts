import { expect, test } from 'bun:test';
import pkg from '../package.json';
import type { JanusRelationsOptions, ModelIssue, ModelLike } from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual(['checkModel', 'janusRelations']);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [ModelIssue, JanusRelationsOptions, ModelLike];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual(['.', './package.json']);
});
