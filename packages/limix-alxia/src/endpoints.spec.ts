import { describe, expect, test } from 'bun:test';
import { alxia, type FreeReplyFunction } from '@softistx/alxia';
import {
	claimApp,
	definitionOf,
	isEndpoint,
	registerEndpoints,
} from './endpoints';

/** A handler of its own: the registry knows handlers by identity. */
const own =
	() =>
	({ reply }: { reply: FreeReplyFunction }) =>
		reply(200, {});

describe('endpoints registry', () => {
	test('a definition is an endpoint by its handler, so a copy of it is one too', () => {
		const app = alxia().get('/a', own()).get('/b', own());
		const [a, b] = app.routes;
		registerEndpoints([a as never], []);
		expect(isEndpoint(a as never)).toBe(true);
		expect(isEndpoint({ ...(a as object), path: '/moved' } as never)).toBe(
			true,
		);
		expect(isEndpoint(b as never)).toBe(false);
	});

	test('a socket is an endpoint by its handlers', () => {
		const app = alxia()
			.ws('/s', { message() {} })
			.ws('/t', { message() {} });
		const [s, t] = app.sockets;
		registerEndpoints([], [s as never]);
		expect(isEndpoint(s as never)).toBe(true);
		expect(isEndpoint(t as never)).toBe(false);
	});

	test('definitionOf finds the route of a method and a path, HEAD by its GET, ALL by any method', () => {
		const app = alxia()
			.get('/a', own())
			.post('/a', own())
			.all('/any', own())
			.ws('/s', { message() {} });
		const at = (method: string, path: string) =>
			definitionOf(app, method, path);
		expect(at('GET', '/a')).toBe(app.routes[0]);
		expect(at('POST', '/a')).toBe(app.routes[1]);
		expect(at('HEAD', '/a')).toBe(app.routes[0]);
		expect(at('PROPFIND', '/any')).toBe(app.routes[2]);
		expect(at('GET', '/s')).toBe(app.sockets[0]);
		expect(at('DELETE', '/a')).toBeUndefined();
		expect(at('GET', '/missing')).toBeUndefined();
	});

	test('one guard per app', () => {
		const app = alxia();
		claimApp(app);
		expect(() => claimApp(app)).toThrow(/already has a limix guard/);
	});
});
