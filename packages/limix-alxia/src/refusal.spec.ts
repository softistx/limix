import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { LimixRefusal } from '@softistx/limix';
import type { MapRefusal, Refusal } from './options';
import { answer, refusalOfError } from './refusal';

function appAnswering(
	errors: 'json' | 'problem',
	refusal: Refusal,
	map?: MapRefusal<object>,
) {
	return alxia({ errors })
		.use(defineMiddleware(async (ctx) => answer(ctx, refusal, map)))
		.get('/x', ({ reply }) => reply(200, {}));
}
const get = (app: { fetch(r: Request): Promise<Response> | Response }) =>
	Promise.resolve(app.fetch(new Request('http://localhost/x')));

describe('refusalOfError', () => {
	test('reads a code under auth.errors. or tenancy.errors. with a status', () => {
		expect(
			refusalOfError({ code: 'tenancy.errors.no-tenant', status: 404 }),
		).toEqual({ code: 'tenancy.errors.no-tenant', status: 404, params: {} });
		expect(
			refusalOfError({
				code: 'auth.errors.x',
				status: 403,
				params: { a: '1' },
			}),
		).toEqual({ code: 'auth.errors.x', status: 403, params: { a: '1' } });
	});

	test('reads nothing else', () => {
		expect(refusalOfError(new Error('x'))).toBeUndefined();
		expect(
			refusalOfError({ code: 'db.errors.x', status: 403 }),
		).toBeUndefined();
		expect(
			refusalOfError({ code: 'auth.errors.x', status: '403' }),
		).toBeUndefined();
		expect(refusalOfError(null)).toBeUndefined();
		expect(refusalOfError('auth.errors.x')).toBeUndefined();
	});
});

describe('answer', () => {
	const refusal = new LimixRefusal('auth.errors.forbidden', 403);

	test('json: the code, and the params only when there are some', async () => {
		const res = await get(appAnswering('json', refusal));
		expect(res.status).toBe(403);
		expect(res.headers.get('content-type')).toContain('application/json');
		expect(await res.json()).toEqual({ code: 'auth.errors.forbidden' });
		const withParams = await get(
			appAnswering('json', {
				code: 'tenancy.errors.x',
				status: 409,
				params: { id: '1' },
			}),
		);
		expect(withParams.status).toBe(409);
		expect(await withParams.json()).toEqual({
			code: 'tenancy.errors.x',
			params: { id: '1' },
		});
	});

	test('problem: application/problem+json with the code as detail and extension', async () => {
		const res = await get(appAnswering('problem', refusal));
		expect(res.status).toBe(403);
		expect(res.headers.get('content-type')).toContain(
			'application/problem+json',
		);
		expect(await res.json()).toMatchObject({
			status: 403,
			detail: 'auth.errors.forbidden',
			code: 'auth.errors.forbidden',
			instance: '/x',
		});
	});

	test('a 503 asks to retry in 5 seconds, in both formats', async () => {
		const down = new LimixRefusal('limix.errors.unavailable', 503, {
			reason: 'no-policy',
		});
		for (const format of ['json', 'problem'] as const) {
			const res = await get(appAnswering(format, down));
			expect(res.status).toBe(503);
			expect(res.headers.get('retry-after')).toBe('5');
		}
	});

	test('mapRefusal rewords the code, status and detail', async () => {
		const map: MapRefusal<object> = () => ({
			code: 'app.errors.nope',
			status: 404,
			detail: 'not here',
		});
		const json = await get(appAnswering('json', refusal, map));
		expect(json.status).toBe(404);
		expect(await json.json()).toEqual({
			code: 'app.errors.nope',
			message: 'not here',
		});
		const prob = await get(appAnswering('problem', refusal, map));
		expect(await prob.json()).toMatchObject({
			status: 404,
			detail: 'not here',
			code: 'app.errors.nope',
		});
	});

	test('mapRefusal may answer with a Response of its own, or keep the refusal', async () => {
		const own = await get(
			appAnswering(
				'json',
				refusal,
				() => new Response('mine', { status: 418 }),
			),
		);
		expect([own.status, await own.text()]).toEqual([418, 'mine']);
		const kept = await get(appAnswering('json', refusal, () => undefined));
		expect(kept.status).toBe(403);
	});

	test('a status that is no HTTP error is a mistake of the host: the request fails closed with 500', async () => {
		const res = await get(
			appAnswering('json', refusal, () => ({ status: 200 as never })),
		);
		expect(res.status).toBe(500);
	});
});
