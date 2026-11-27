import { expect, test } from 'bun:test';
import type {
	CoverageReport,
	CoverageStatus,
	CoverageSummary,
	GraphqlOperation,
	Operation,
	OperationCoverage,
	RestOperation,
	StaleRule,
} from './index';
import * as api from './index';

test('the public surface', () => {
	expect(Object.keys(api).sort()).toEqual(['coverage', 'rulesPathOf']);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	CoverageReport,
	CoverageStatus,
	CoverageSummary,
	GraphqlOperation,
	Operation,
	OperationCoverage,
	RestOperation,
	StaleRule,
];
