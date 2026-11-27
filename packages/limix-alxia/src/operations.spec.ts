import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { alxiaOperations } from './operations';

const label = (app: Parameters<typeof alxiaOperations>[0]) =>
	alxiaOperations(app).map((o) => `${o.method} ${o.path}`);

describe('alxiaOperations', () => {
	test('lists the routes in declaration order, each GET with its HEAD', () => {
		const app = alxia()
			.get('/a', ({ reply }) => reply(200, {}))
			.post('/a', ({ reply }) => reply(200, {}))
			.delete('/b/:id', ({ reply }) => reply(200, {}));
		expect(label(app)).toEqual([
			'GET /a',
			'POST /a',
			'DELETE /b/:id',
			'HEAD /a',
		]);
	});

	test('an explicit HEAD route keeps its own entry, once', () => {
		const app = alxia()
			.get('/a', ({ reply }) => reply(200, {}))
			.head('/a', ({ reply }) => reply(200, undefined));
		expect(label(app)).toEqual(['GET /a', 'HEAD /a']);
	});

	test('spells a trailing wildcard and a group prefix as limix does', () => {
		const app = alxia();
		app.group('/g', (g) => g.get('/files/*', ({ reply }) => reply(200, {})));
		expect(label(app)).toEqual(['GET /g/files/*path', 'HEAD /g/files/*path']);
	});

	test('expands an all route to the methods its path does not declare', () => {
		const app = alxia()
			.post('/x', ({ reply }) => reply(200, {}))
			.all('/x', ({ reply }) => reply(200, {}));
		const methods = alxiaOperations(app).map((o) => o.method);
		expect(methods).toEqual([
			'POST',
			'GET',
			'PUT',
			'PATCH',
			'DELETE',
			'OPTIONS',
			'QUERY',
			'HEAD',
		]);
	});

	test('lists a socket as the GET that upgrades it', () => {
		const app = alxia().ws('/live', { message() {} });
		expect(label(app)).toEqual(['GET /live', 'HEAD /live']);
	});

	test('reads a group on its own, with the routes it declares', () => {
		const app = alxia().get('/outside', ({ reply }) => reply(200, {}));
		app.group('/in', (g) => {
			g.get('/a', ({ reply }) => reply(200, {}));
			expect(label(g)).toEqual(['GET /in/a', 'HEAD /in/a']);
			return g;
		});
		expect(label(app)).toContain('GET /outside');
	});

	test('returns coverage-shaped operations', () => {
		const app = alxia().get('/a', ({ reply }) => reply(200, {}));
		expect(alxiaOperations(app)[0]).toEqual({
			kind: 'rest',
			method: 'GET',
			path: '/a',
		});
	});
});
