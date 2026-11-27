import { expect, test } from 'bun:test';
import pkg from '../package.json';
import type {
	GraphqlOperationsOptions,
	LimixContext,
	LimixGraxiaOptions,
	MapRefusal,
	NeedsIssue,
	NeedsIssueKind,
	RefusalAnswer,
	RefusalAt,
	RefusalErrorOptions,
} from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual([
		'canOf',
		'checkNeeds',
		'graphqlOperations',
		'guardSchema',
		'isGuarded',
		'limixGraxia',
		'refusalError',
	]);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	GraphqlOperationsOptions,
	LimixContext,
	LimixGraxiaOptions,
	MapRefusal,
	NeedsIssue,
	NeedsIssueKind,
	RefusalAnswer,
	RefusalAt,
	RefusalErrorOptions,
];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual([
		'.',
		'./operations',
		'./package.json',
	]);
});
