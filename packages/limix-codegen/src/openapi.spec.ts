import { describe, expect, it } from 'bun:test';
import { openapiOperations } from './openapi';

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

	it('spells paths as core does: quoted, escaped, unbalanced braces refused', () => {
		expect(
			openapiOperations({
				paths: { '/files/{id}.json': { get: {} }, '/f/{file-id}': { get: {} } },
			}).map((o) => o.path),
		).toEqual(['/files/:id.json', '/f/:"file-id"']);
		expect(() =>
			openapiOperations({ paths: { '/a/{b': { get: {} } } }, 'api.yaml'),
		).toThrow('api.yaml: unbalanced { in path /a/{b');
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

	it('refuses a path that cannot be a limix pattern', () => {
		expect(() =>
			openapiOperations({ paths: { '/a/{x}{y}': { get: {} } } }, 'api.yaml'),
		).toThrow(/^api.yaml: adjacent parameters in \/a\/\{x\}\{y\}/);
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
