import { describe, expect, it } from 'bun:test';
import { compilePolicy, parseRules } from '@softistx/limix';
import { coverage } from '@softistx/limix/coverage';
import { CodegenError } from './errors';
import { openapiOperations, openapiPath } from './openapi';

describe('openapiPath', () => {
	it.each([
		['/notes/{id}', '/notes/:id'],
		['/files/{id}.json', '/files/:id.json'],
		['/files/{id}x', '/files/:"id"x'],
		['/files/{file-id}', '/files/:"file-id"'],
		['/a({b})', '/a\\(:b\\)'],
		['/a:b*', '/a\\:b\\*'],
		['/plain', '/plain'],
		['/a/{x}/b/{y}', '/a/:x/b/:y'],
		['/q?x+y!', '/q\\?x\\+y\\!'],
		['/s\\t', '/s\\\\t'],
	])('%s -> %s', (from, to) => {
		expect(openapiPath(from)).toBe(to);
	});

	it('refuses unbalanced braces and an empty name', () => {
		expect(() => openapiPath('/a/{b')).toThrow('unbalanced { in path /a/{b');
		expect(() => openapiPath('/a/b}')).toThrow(CodegenError);
		expect(() => openapiPath('/a/{}')).toThrow('empty {}');
	});

	it('writes patterns the compiler accepts and matches as the spec says', () => {
		const paths = [
			'/notes/{id}',
			'/files/{name}.json',
			'/files/{id}x',
			'/files/{file-id}',
			'/a({b})',
			'/a:b*',
		].map(openapiPath);
		const rest = Object.fromEntries(
			paths.map((path) => [path, { GET: { authenticated: true } }]),
		);
		const rules = parseRules({
			limix: 1,
			global: { unmatched: 'deny' },
			rest,
		});
		expect(() => compilePolicy(rules)).not.toThrow();
		const policy = compilePolicy(rules);
		const report = coverage(policy, [
			{ kind: 'rest', method: 'GET', path: '/files/a.json' },
			{ kind: 'rest', method: 'GET', path: '/files/abx' },
			{ kind: 'rest', method: 'GET', path: '/files/a-b' },
		]);
		expect(report.summary.uncovered).toBe(0);
	});
});

describe('openapiOperations', () => {
	it('reads every method key, in document order, and ignores the rest', () => {
		const item = {
			parameters: [],
			summary: 'x',
			description: 'x',
			servers: [],
			'x-extra': {},
			additionalOperations: { LINK: {} },
			get: {},
			put: {},
			post: {},
			delete: {},
			options: {},
			head: {},
			patch: {},
			trace: {},
			query: {},
		};
		const operations = openapiOperations({
			openapi: '3.2.0',
			servers: [{ url: '/api' }],
			basePath: '/v1',
			webhooks: { hook: { post: {} } },
			paths: { '/a/{id}': item },
		});
		expect(operations.map((o) => o.method)).toEqual([
			'GET',
			'PUT',
			'POST',
			'DELETE',
			'OPTIONS',
			'HEAD',
			'PATCH',
			'TRACE',
			'QUERY',
		]);
		expect(operations.every((o) => o.path === '/a/:id')).toBe(true);
	});

	it('accepts Swagger 2.0', () => {
		expect(
			openapiOperations({ swagger: '2.0', paths: { '/x': { get: {} } } }),
		).toEqual([{ kind: 'rest', method: 'GET', path: '/x' }]);
	});

	it('refuses what is not a document', () => {
		for (const bad of [null, 'x', [], {}, { paths: [] }, { paths: 1 }]) {
			expect(() => openapiOperations(bad, 'api.yaml')).toThrow(
				'api.yaml: not an OpenAPI document: `paths` must be an object',
			);
		}
	});

	it('refuses a path item that is a $ref', () => {
		expect(() =>
			openapiOperations({ paths: { '/a': { $ref: 'a.yaml' } } }, 'api.yaml'),
		).toThrow(
			'api.yaml: path item /a is a $ref: bundle the spec first (one file, path items inline)',
		);
	});

	it('refuses a path without a slash and an item that is not an object', () => {
		expect(() => openapiOperations({ paths: { a: {} } })).toThrow(
			'must start with /',
		);
		expect(() => openapiOperations({ paths: { '/a': 1 } })).toThrow(
			'must be an object',
		);
	});
});
