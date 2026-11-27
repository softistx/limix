import { expect, test } from 'bun:test';
import pkg from '../package.json';
import type {
	LimixAlxiaOptions,
	MapRefusal,
	Refusal,
	RefusalAnswer,
	RoutesOf,
} from './index';
import * as limixAlxia from './index';

test('exports the guard, the operations and the route checks, and no GraphQL', () => {
	expect(Object.keys(limixAlxia).sort()).toEqual([
		'alxiaOperations',
		'checkGuard',
		'checkRoutes',
		'limixGuard',
	]);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	LimixAlxiaOptions,
	MapRefusal<object>,
	Refusal,
	RefusalAnswer,
	RoutesOf,
];

test('the package exports map', () => {
	expect(Object.keys(pkg.exports).sort()).toEqual([
		'.',
		'./graphql',
		'./package.json',
	]);
});
