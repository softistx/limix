import { describe, expect, test } from 'bun:test';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { decodedPath, limixPath, paramsOf } from './path';

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
				rest: { [pattern as '/x']: { GET: { public: true } } },
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

describe('decodedPath', () => {
	test('puts the decoded parameters back into the route', () => {
		expect(
			decodedPath('/api/users/:id/posts/:post', { id: 'me', post: '7' }),
		).toBe('/api/users/me/posts/7');
		expect(decodedPath('/health', {})).toBe('/health');
	});

	test('keeps a slash or a percent in a parameter inside its segment', () => {
		expect(decodedPath('/u/:id', { id: 'a/b' })).toBe('/u/a%2Fb');
		expect(decodedPath('/u/:id', { id: '50%' })).toBe('/u/50%25');
		expect(decodedPath('/u/:id', { id: '%6De' })).toBe('/u/%256De');
	});

	test('keeps a wildcard value as it is, slashes included', () => {
		expect(decodedPath('/f/*', { '*': 'a/b/c' })).toBe('/f/a/b/c');
		expect(decodedPath('/f/*', {})).toBe('/f/');
	});
});
