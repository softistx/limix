import { describe, expect, test } from 'bun:test';
import { LimixRefusal } from '@softistx/limix';
import { refusalError } from './refusal';

const forbidden = new LimixRefusal('auth.errors.forbidden', 403);

describe('refusalError', () => {
	test('the message is the code, the status rides in extensions', () => {
		const error = refusalError(forbidden);
		expect(error.message).toBe('auth.errors.forbidden');
		expect(error.extensions).toEqual({
			code: 'auth.errors.forbidden',
			status: 403,
		});
	});

	test('a root field asks for its HTTP status, a nested one does not', () => {
		const at = { type: 'Query', field: 'me' };
		expect(
			refusalError(forbidden, { at: { ...at, root: true } }).extensions,
		).toEqual({
			code: 'auth.errors.forbidden',
			status: 403,
			http: { status: 403 },
		});
		expect(
			refusalError(forbidden, { at: { ...at, root: false } }).extensions[
				'http'
			],
		).toBeUndefined();
	});

	test('an explicit top-level flag decides the HTTP status over the root flag', () => {
		const at = { type: 'Query', field: 'me', root: true };
		expect(
			refusalError(forbidden, { at, topLevel: false }).extensions['http'],
		).toBeUndefined();
		expect(
			refusalError(forbidden, {
				at: { ...at, root: false },
				topLevel: true,
			}).extensions['http'],
		).toEqual({ status: 403 });
	});

	test('a 503 carries retry-after and its params', () => {
		const down = new LimixRefusal('limix.errors.unavailable', 503, {
			reason: 'no-policy',
		});
		const { extensions } = refusalError(down, {
			at: { type: 'Query', field: 'me', root: true },
		});
		expect(extensions['params']).toEqual({ reason: 'no-policy' });
		expect(extensions['http']).toEqual({
			status: 503,
			headers: { 'retry-after': '5' },
		});
	});

	test('mapRefusal replaces code, message and status, and sees where', () => {
		const seen: unknown[] = [];
		const error = refusalError(forbidden, {
			mapRefusal: (refusal, at) => {
				seen.push(refusal.code, at);
				return { code: 'mine', status: 404 };
			},
			at: { type: 'Query', field: 'me', root: true },
		});
		expect(error.message).toBe('mine');
		expect(error.extensions).toMatchObject({
			code: 'mine',
			status: 404,
			http: { status: 404 },
		});
		expect(seen[1]).toEqual({ type: 'Query', field: 'me', root: true });
		expect(
			refusalError(forbidden, { mapRefusal: () => ({ message: 'words' }) })
				.message,
		).toBe('words');
		expect(
			refusalError(forbidden, { mapRefusal: () => undefined }).message,
		).toBe('auth.errors.forbidden');
	});
});
