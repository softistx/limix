import { describe, expect, it } from 'bun:test';
import { readIds } from './ids';

const roots = {
	param: { id: 'p1' },
	query: { ids: ['a', 'b'], empty: '' },
	json: { doc: { id: 'd1' }, n: 3 },
};

describe('readIds', () => {
	it('reads a dotted path under a root', () => {
		expect(readIds(roots, 'param.id')).toEqual(['p1']);
		expect(readIds(roots, 'json.doc.id')).toEqual(['d1']);
	});

	it('gives one id per element of a list', () => {
		expect(readIds(roots, 'query.ids')).toEqual(['a', 'b']);
	});

	it('gives none for a missing path, an empty string or a non-string', () => {
		expect(readIds(roots, 'param.nope')).toEqual([]);
		expect(readIds(roots, 'query.empty')).toEqual([]);
		expect(readIds(roots, 'json.n')).toEqual([]);
		expect(readIds(roots, 'other.id')).toEqual([]);
	});

	it('reads own properties only', () => {
		expect(readIds(roots, 'param.constructor')).toEqual([]);
		expect(readIds(roots, '__proto__.x')).toEqual([]);
	});
});
