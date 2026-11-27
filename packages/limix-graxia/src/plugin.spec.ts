import { describe, expect, test } from 'bun:test';
import { createGraxia } from '@softistx/graxia';
import { LimixRefusal, mutableSource } from '@softistx/limix';
import { guardSchema } from './guard';
import { limixGraxia } from './plugin';
import { claims, fixtureSchema, policy } from './schema.fixtures';

const claimsOfRequest = (ctx: { request: Request }) =>
	ctx.request.headers.get('x-user') === null ? claims.anon : claims.admin;

function server(extra: Record<string, unknown> = {}, source: unknown = policy) {
	const options = {
		policy: source as typeof policy,
		claims: claimsOfRequest,
		...extra,
	};
	return createGraxia({
		schema: guardSchema(fixtureSchema(), options),
		plugins: [limixGraxia(options)],
		context: ({ request }: { request: Request }) => ({ request }),
		onUnexpected: false,
	});
}

const post = (
	graxia: ReturnType<typeof server>,
	query: string,
	headers: Record<string, string> = {},
) =>
	graxia.fetch(
		new Request('http://graxia.test/graphql', {
			method: 'POST',
			headers: { 'content-type': 'application/json', ...headers },
			body: JSON.stringify({ query }),
		}),
	);

describe('limixGraxia()', () => {
	test('serves an allowed request', async () => {
		const response = await post(server(), '{ me }', { 'x-user': '1' });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ data: { me: 'me' } });
	});

	test('an anonymous root refusal answers 401, with its code and status in extensions only', async () => {
		const response = await post(server(), '{ me }');
		expect(response.status).toBe(401);
		const body = (await response.json()) as {
			errors: { extensions: Record<string, unknown> }[];
		};
		expect(body.errors[0]?.extensions).toEqual({
			code: 'auth.errors.unauthenticated',
			status: 401,
		});
	});

	test('no policy held answers 503 with retry-after', async () => {
		const response = await post(server({}, mutableSource()), '{ open }', {
			'x-user': '1',
		});
		expect(response.status).toBe(503);
		expect(response.headers.get('retry-after')).toBe('5');
	});

	test('a nested refusal stays a 200 with partial data', async () => {
		const open = server();
		const response = await post(open, '{ open note(id: 1) { id } }');
		expect(response.status).toBe(401);
		const wide = server({
			policy: (await import('@softistx/limix')).compilePolicy(
				(await import('@softistx/limix')).definePolicy({
					limix: 1,
					global: { unmatched: 'allow' },
					graphql: { Note: { body: { authenticated: true } } },
				}),
			),
		});
		const nested = await post(wide, '{ note(id: 1) { title body } }');
		expect(nested.status).toBe(200);
		expect(((await nested.json()) as { data: unknown }).data).toEqual({
			note: { title: 'T', body: null },
		});
	});

	test('mapRefusal rewords the code the client sees', async () => {
		const response = await post(
			server({ mapRefusal: () => ({ code: 'mine', status: 418 }) }),
			'{ me }',
		);
		expect(response.status).toBe(418);
		const body = (await response.json()) as { errors: { message: string }[] };
		expect(body.errors[0]?.message).toBe('mine');
	});

	test('claims are read once, through ctx.limix', async () => {
		let reads = 0;
		const graxia = server({
			claims: (ctx: { request: Request }) => {
				reads++;
				return claimsOfRequest(ctx);
			},
		});
		await post(graxia, '{ me secret open }', { 'x-user': '1' });
		expect(reads).toBe(1);
	});

	test('refuses to start on a schema guardSchema did not make', async () => {
		const unguarded = createGraxia({
			schema: fixtureSchema(),
			plugins: [limixGraxia({ policy, claims: claimsOfRequest })],
			context: ({ request }: { request: Request }) => ({ request }),
			onUnexpected: false,
		});
		await expect(unguarded.ready).rejects.toThrow(
			'was not made by guardSchema',
		);
	});

	test('a refusal a resolver threw is remapped to the same error', async () => {
		const schema = fixtureSchema();
		const field = schema.getQueryType()?.getFields()['free'];
		if (field) {
			field.resolve = (() => {
				throw new LimixRefusal('auth.errors.forbidden', 403);
			}) as never;
		}
		const options = { policy, claims: claimsOfRequest };
		const graxia = createGraxia({
			schema: guardSchema(schema, options),
			plugins: [limixGraxia(options)],
			context: ({ request }: { request: Request }) => ({ request }),
			onUnexpected: false,
		});
		const response = await post(graxia, '{ free }');
		expect(response.status).toBe(403);
		const body = (await response.json()) as {
			errors: { extensions: Record<string, unknown> }[];
		};
		expect(body.errors[0]?.extensions).toEqual({
			code: 'auth.errors.forbidden',
			status: 403,
		});
	});

	test('refuses bad options at construction', () => {
		expect(() => limixGraxia({ policy } as never)).toThrow('limixGraxia()');
	});
});
