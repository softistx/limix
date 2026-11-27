import { describe, expect, test } from 'bun:test';
import { LimixRefusal } from '@softistx/limix';
import { GraphQLError } from 'graphql';
import { remapPayload } from './remap';

const thrown = (path: (string | number)[]) =>
	new GraphQLError('auth.errors.forbidden', {
		originalError: new LimixRefusal('auth.errors.forbidden', 403, { why: 1 }),
		path,
	});

describe('remapPayload', () => {
	test('turns a thrown refusal into the guarded error, keeping its path', () => {
		const result = remapPayload({ data: null, errors: [thrown(['me'])] });
		const [error] = result.errors as GraphQLError[];
		expect(error?.path).toEqual(['me']);
		expect(error?.extensions).toEqual({
			code: 'auth.errors.forbidden',
			status: 403,
			params: { why: 1 },
			http: { status: 403 },
		});
	});

	test('a nested path carries no http, and mapRefusal sees the field', () => {
		const seen: unknown[] = [];
		const result = remapPayload(
			{ errors: [thrown(['note', 'body'])] },
			(_r, at) => {
				seen.push(at);
				return { code: 'mine' };
			},
		);
		const [error] = result.errors as GraphQLError[];
		expect(error?.message).toBe('mine');
		expect(error?.extensions['http']).toBeUndefined();
		expect(seen).toEqual([{ type: '', field: 'body', root: false }]);
	});

	test('reaches the errors of incremental and completed entries', () => {
		const result = remapPayload({
			incremental: [{ errors: [thrown(['a'])] }],
			completed: [{ errors: [thrown(['b'])] }],
		});
		const statuses = [...result.incremental, ...result.completed].map(
			(entry) => (entry.errors[0] as GraphQLError).extensions['status'],
		);
		expect(statuses).toEqual([403, 403]);
	});

	test('returns the value itself when nothing changed', () => {
		const plain = new GraphQLError('x', { extensions: { code: 'X' } });
		const same = { data: { a: 1 }, errors: [plain] };
		expect(remapPayload(same)).toBe(same);
		expect(remapPayload(null)).toBeNull();
		expect(remapPayload('text')).toBe('text');
		const stream = (async function* () {})();
		expect(remapPayload(stream)).toBe(stream);
	});

	test('converts an error once', () => {
		const first = remapPayload({ errors: [thrown(['me'])] });
		expect(remapPayload(first)).toBe(first);
	});
});
