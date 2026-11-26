import { describe, expect, test } from 'bun:test';
import { subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@softistx/janus', {
				'.': {},
				'./identities': {},
				'./conformance': {},
				'./package.json': './package.json',
			}),
		).toEqual([
			'@softistx/janus',
			'@softistx/janus/identities',
			'@softistx/janus/conformance',
		]);
	});
});
