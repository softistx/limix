import { describe, expect, it } from 'bun:test';
import { compileMatcher } from './matcher';
import { opensPattern, PatternError, parsePattern } from './pattern';

const params = (pattern: string, path: string) => {
	const result = compileMatcher(pattern)(path);
	return result === false ? false : { ...result.params };
};

describe('the route matcher', () => {
	it('takes a parameter for one segment, decoded', () => {
		expect(params('/users/:id', '/users/a%20b')).toEqual({ id: 'a b' });
		expect(params('/users/:id', '/users/a/b')).toBe(false);
	});

	it('ignores case and one trailing slash', () => {
		expect(params('/Users/:id', '/users/1/')).toEqual({ id: '1' });
		expect(compileMatcher('/users')('/users//')).toBe(false);
	});

	it('takes the rest of the path for a wildcard, as decoded segments', () => {
		expect(params('/files/*path', '/files/a/b%2Fc')).toEqual({
			path: ['a', 'b/c'],
		});
		expect(compileMatcher('/files/*path')('/files')).toBe(false);
	});

	it('takes an optional group with or without its content', () => {
		expect(params('/things{/:id}', '/things')).toEqual({});
		expect(params('/things{/:id}', '/things/7')).toEqual({ id: '7' });
		expect(params('/files{.:ext}', '/files.json')).toEqual({ ext: 'json' });
	});

	it('reads a backslash as the next character, literally', () => {
		expect(compileMatcher('/a\\:b')('/a:b')).not.toBe(false);
		expect(params('/x/:"a-b"', '/x/1')).toEqual({ 'a-b': '1' });
	});

	it('throws the URIError of a malformed escape, as the evaluator expects', () => {
		expect(() => compileMatcher('/users/:id')('/users/%E0%A4%A')).toThrow(
			URIError,
		);
	});
});

describe('a pattern that does not parse', () => {
	const message = (pattern: string) => {
		try {
			compileMatcher(pattern);
		} catch (error) {
			expect(error).toBeInstanceOf(PatternError);
			return (error as Error).message;
		}
		throw new Error('expected a PatternError');
	};

	it('names the missing parameter name and how to write one', () => {
		expect(message('/a/:')).toBe(
			'Missing parameter name at index 4, write :name (for example /:id) or escape the : with a backslash: /a/:',
		);
		expect(message('/a/*')).toContain('write *name');
	});

	it('gives a stray } its own message', () => {
		expect(message('/a}')).toBe(
			'Unexpected } at index 2 with no { open, escape it with a backslash to match it literally: /a}',
		);
	});

	it('refuses regular-expression syntax and says to escape it', () => {
		expect(message('/b/(')).toBe(
			'Unexpected ( at index 3, regular expressions are not supported, escape it with a backslash to match it literally: /b/(',
		);
		for (const char of ['?', '+', '!', '[', ']', ')', '}']) {
			expect(message(`/a${char}`)).toStartWith(`Unexpected ${char} at index 2`);
		}
	});

	it('names an unclosed group, an unterminated quote and a trailing backslash', () => {
		expect(message('/a{/:id')).toStartWith(
			'Unexpected end at index 7, expected }',
		);
		expect(message('/a/:"id')).toStartWith('Unterminated quote at index 4');
		expect(message('/a\\')).toStartWith('Unexpected end after \\ at index 3');
	});

	it('refuses two captures with no text between them', () => {
		expect(message('/:a:b')).toBe(
			'Missing text before "b" param, put a literal character between two captures: /:a:b',
		);
	});

	it('refuses a pattern with too many optional combinations', () => {
		expect(message('/a{/b}'.repeat(9))).toStartWith(
			'Too many path combinations, use fewer optional groups',
		);
	});
});

describe('the pattern tokens', () => {
	it('opens for a wildcard or an optional group holding a capture, not plain text', () => {
		expect(opensPattern(parsePattern('/f/*p'))).toBe(true);
		expect(opensPattern(parsePattern('/t{/:id}'))).toBe(true);
		expect(opensPattern(parsePattern('/t/{id}'))).toBe(false);
		expect(opensPattern(parsePattern('/t/:id'))).toBe(false);
	});
});
