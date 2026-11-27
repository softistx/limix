import { describe, expect, test } from 'bun:test';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { limixPath, paramsOf } from './path';

describe('limixPath', () => {
	test('keeps a plain path and its parameters', () => {
		expect(limixPath('/users/:id/notes')).toBe('/users/:id/notes');
		expect(limixPath('/')).toBe('/');
	});

	test('names a trailing wildcard', () => {
		expect(limixPath('/files/*')).toBe('/files/*path');
		expect(limixPath('*')).toBe('*path');
	});

	test('escapes what limix reads as syntax', () => {
		expect(limixPath('/a(b)/{c}/[d]+?!')).toBe(
			'/a\\(b\\)/\\{c\\}/\\[d\\]\\+\\?\\!',
		);
	});

	test('what it returns is a pattern limix compiles, and takes the same path', () => {
		const pattern = limixPath('/files/(x)/*');
		const policy = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { [pattern]: { GET: { public: true } } },
			}),
		);
		const route = policy.restRoutesByMethod.get('GET')?.[0];
		expect(route?.matcher('/files/(x)/a/b')).toMatchObject({
			params: { path: ['a', 'b'] },
		});
	});
});

describe('paramsOf', () => {
	test('renames the wildcard to path', () => {
		expect(paramsOf({ id: '1', '*': 'a/b' })).toEqual({ id: '1', path: 'a/b' });
		expect(paramsOf({})).toEqual({});
	});
});
