import { describe, expect, it } from 'bun:test';
import { compareRest, compareText, uniqueSorted } from './order';

describe('order', () => {
	it('compares text by code unit', () => {
		expect(['b', 'B', 'a'].sort(compareText)).toEqual(['B', 'a', 'b']);
	});

	it('sorts REST by path, then by schema method order', () => {
		const list = [
			{ method: 'DELETE', path: '/b' },
			{ method: 'POST', path: '/a' },
			{ method: 'get', path: '/a' },
			{ method: 'PATCH', path: '/a' },
		];
		expect(list.sort(compareRest).map((o) => `${o.method} ${o.path}`)).toEqual([
			'get /a',
			'POST /a',
			'PATCH /a',
			'DELETE /b',
		]);
	});

	it('removes duplicates and sorts', () => {
		expect(uniqueSorted(['b', 'a', 'b'], compareText)).toEqual(['a', 'b']);
	});
});
