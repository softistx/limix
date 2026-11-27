import { describe, expect, it } from 'bun:test';
import { compilePolicy } from '../rules/compile';
import { parseRules } from '../rules/parse';
import { coverage, rulesPathOf } from './index';

describe('rulesPathOf', () => {
	it.each([
		['/notes/{id}', '/notes/:id'],
		['/things/{id}', '/things/:id'],
		['/files/{id}.json', '/files/:id.json'],
		['/files/{id}x', '/files/:"id"x'],
		['/files/{file-id}', '/files/:"file-id"'],
		['/a({b})', '/a\\(:b\\)'],
		['/a:b*', '/a\\:b\\*'],
		['/plain', '/plain'],
		['/', '/'],
		['/a/{x}/b/{y}', '/a/:x/b/:y'],
		['/q?x+y!', '/q\\?x\\+y\\!'],
		['/s\\t', '/s\\\\t'],
		['/a/{b"c}', '/a/:"b\\"c"'],
	])('%s -> %s', (from, to) => {
		expect(rulesPathOf(from)).toBe(to);
	});

	it('refuses adjacent parameters', () => {
		expect(() => rulesPathOf('/a/{x}{y}')).toThrow(
			new TypeError(
				'adjacent parameters in /a/{x}{y}: limix needs literal text between two captures',
			),
		);
	});

	it('refuses unbalanced braces and an empty name', () => {
		expect(() => rulesPathOf('/a/{b')).toThrow('unbalanced { in path /a/{b');
		expect(() => rulesPathOf('/a/b}')).toThrow(TypeError);
		expect(() => rulesPathOf('/a/b}')).toThrow('unbalanced } in path /a/b}');
		expect(() => rulesPathOf('/a/{}')).toThrow('empty {}');
	});

	it('writes patterns the compiler accepts and matches as the spec says', () => {
		const paths = [
			'/notes/{id}',
			'/files/{name}.json',
			'/files/{id}x',
			'/files/{file-id}',
			'/a({b})',
			'/a:b*',
		].map(rulesPathOf);
		const rest = Object.fromEntries(
			paths.map((path) => [path, { GET: { authenticated: true } }]),
		);
		const rules = parseRules({
			limix: 1,
			global: { unmatched: 'deny' },
			rest,
		});
		const policy = compilePolicy(rules);
		const report = coverage(policy, [
			{ kind: 'rest', method: 'GET', path: '/files/a.json' },
			{ kind: 'rest', method: 'GET', path: '/files/abx' },
			{ kind: 'rest', method: 'GET', path: '/files/a-b' },
		]);
		expect(report.summary.uncovered).toBe(0);
	});
});
