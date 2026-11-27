import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { allowAll } from './app.fixtures';
import { readsBody, restCall } from './request';

const body = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'allow' },
		rest: {
			'/notes': {
				POST: {
					relations: [
						{
							require: [[{ relation: 'v', type: 'note', from: 'json.noteId' }]],
						},
					],
				},
			},
		},
	}),
);

/** An app whose only middleware answers with what `restCall` read, and whether the handler's body read still works. */
function reading(policy = body) {
	return alxia()
		.use(
			defineMiddleware(async (ctx, next) => {
				if (ctx.route === undefined) return next();
				const call = await restCall(ctx, ctx.route, policy);
				return ctx.reply(200, call, {
					headers: { 'x-call': JSON.stringify(call) },
				});
			}),
		)
		.get('/a/:id', ({ reply }) => reply(200, {}))
		.get('/f/*', ({ reply }) => reply(200, {}))
		.post('/notes', { bodyLimit: 20 }, ({ reply }) => reply(200, {}));
}
const read = async (
	app: ReturnType<typeof reading>,
	path: string,
	init?: RequestInit,
) => {
	const res = await app.fetch(new Request(`http://localhost${path}`, init));
	return JSON.parse(res.headers.get('x-call') ?? 'null');
};

describe('restCall', () => {
	test('reads the method, the declared route, the path, the params and the query', async () => {
		expect(await read(reading(), '/a/7?x=1&x=2&y=3')).toEqual({
			method: 'GET',
			route: '/a/:id',
			path: '/a/7',
			request: { params: { id: '7' }, query: { x: ['1', '2'], y: '3' } },
		});
	});

	test('keeps HEAD as HEAD and names a wildcard path', async () => {
		expect(await read(reading(), '/f/a/b', { method: 'HEAD' })).toMatchObject({
			method: 'HEAD',
			route: '/f/*path',
			request: { params: { path: 'a/b' } },
		});
	});

	test('reads the JSON body only when a rule needs it, from a clone', async () => {
		const call = await read(reading(), '/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"noteId":"n1"}',
		});
		expect(call.request.json).toEqual({ noteId: 'n1' });
		const skipped = await read(reading(allowAll), '/notes', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{"noteId":"n1"}',
		});
		expect('json' in skipped.request).toBe(false);
	});

	test('a body that is not JSON, or not declared JSON, gives no json', async () => {
		for (const [type, text] of [
			['application/json', '{nope'],
			['text/plain', '{"a":1}'],
		] as const) {
			const call = await read(reading(), '/notes', {
				method: 'POST',
				headers: { 'content-type': type },
				body: text,
			});
			expect(call.request.json).toBeUndefined();
		}
	});

	test('a body over the route limit is the 413 of alxia', async () => {
		const res = await reading().fetch(
			new Request('http://localhost/notes', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ noteId: 'x'.repeat(100) }),
			}),
		);
		expect(res.status).toBe(413);
	});
});

describe('readsBody', () => {
	test('is true for the method a rule reads json in, and HEAD asks the GET rules', () => {
		expect(readsBody(body, 'POST')).toBe(true);
		expect(readsBody(body, 'GET')).toBe(false);
		expect(readsBody(body, 'HEAD')).toBe(false);
		expect(readsBody(allowAll, 'POST')).toBe(false);
	});
});
