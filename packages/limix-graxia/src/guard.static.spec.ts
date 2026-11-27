import { describe, expect, test } from 'bun:test';
import { type Claims, compilePolicy, definePolicy } from '@softistx/limix';
import { printSchema } from 'graphql';
import { guardSchema } from './guard';
import { claims, fixtureSchema, policy, run, SDL } from './schema.fixtures';

const nestedOnly = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'allow' },
		graphql: { Note: { body: { authenticated: true } } },
	}),
);
const as = (c: Claims) => ({ who: c });
const guard = (extra = {}) =>
	guardSchema(fixtureSchema(), {
		policy,
		claims: (ctx: { who: Claims }) => ctx.who,
		...extra,
	});

describe('guardSchema, static policy', () => {
	test('a public field answers anyone', async () => {
		const result = await run(guard(), '{ open }', as(claims.anon));
		expect(result).toEqual({ data: { open: 'open' } });
	});

	test('an anonymous caller is refused 401, an authenticated one without the role 403', async () => {
		const schema = guard();
		const anon = await run(schema, '{ me }', as(claims.anon));
		expect(anon.data).toEqual({ me: null });
		expect(anon.errors?.[0]?.extensions).toMatchObject({
			code: 'auth.errors.unauthenticated',
			status: 401,
			http: { status: 401 },
		});
		const reader = await run(schema, '{ secret }', as(claims.reader));
		expect(reader.errors?.[0]?.extensions).toMatchObject({
			code: 'auth.errors.forbidden',
			status: 403,
		});
		expect((await run(schema, '{ secret }', as(claims.admin))).data).toEqual({
			secret: 'secret',
		});
	});

	test('a root field no rule names is denied under unmatched: deny', async () => {
		const result = await run(guard(), '{ notes { id } }', as(claims.admin));
		expect(result.errors?.[0]?.extensions?.['code']).toBe(
			'auth.errors.forbidden',
		);
	});

	test('a nested refusal keeps the partial data and carries no http', async () => {
		const result = await run(
			guard(),
			'{ note(id: 1) { title body } }',
			as(claims.anon),
		);
		expect(result.data).toEqual({ note: null });
		const wide = guardSchema(fixtureSchema(), {
			policy: nestedOnly,
			claims: (ctx: { who: Claims }) => ctx.who,
		});
		const nested = await run(
			wide,
			'{ note(id: 1) { title body } }',
			as(claims.anon),
		);
		expect(nested.data).toEqual({ note: { title: 'T', body: null } });
		expect(nested.errors?.[0]?.extensions).toEqual({
			code: 'auth.errors.unauthenticated',
			status: 401,
		});
	});

	test('a mutation checks permissions', async () => {
		const schema = guard();
		const refused = await run(
			schema,
			'mutation { updateNote(id: 1) { id } }',
			as(claims.reader),
		);
		expect(refused.errors?.[0]?.extensions?.['status']).toBe(403);
		const done = await run(
			schema,
			'mutation { updateNote(id: 1) { id } }',
			as(claims.admin),
		);
		expect(done.data).toEqual({ updateNote: { id: '1' } });
	});

	test('only governed fields are wrapped; the others keep their resolver', () => {
		const original = fixtureSchema();
		const next = guardSchema(original, { policy, claims: () => claims.admin });
		const field = (s: typeof next, t: string, f: string) =>
			(s.getType(t) as import('graphql').GraphQLObjectType).getFields()[f]
				?.resolve;
		expect(field(next, 'Note', 'title')).toBe(field(original, 'Note', 'title'));
		expect(field(next, 'Query', 'me')).not.toBe(field(original, 'Query', 'me'));
		expect(printSchema(next)).toBe(printSchema(original));
	});

	test('without the plugin claims are read per governed field, and mapRefusal rewords', async () => {
		let reads = 0;
		const schema = guardSchema(fixtureSchema(), {
			policy,
			claims: () => {
				reads++;
				return claims.anon;
			},
			mapRefusal: (r) => ({ code: `my.${r.code}`, status: 418 }),
		});
		const result = await run(schema, '{ me secret }', {});
		expect(reads).toBe(2);
		expect(result.errors?.map((e) => e.message)).toEqual([
			'my.auth.errors.unauthenticated',
			'my.auth.errors.unauthenticated',
		]);
		expect(result.errors?.[0]?.extensions?.['status']).toBe(418);
	});

	test('a relations function of the context reaches the rule', async () => {
		const withRelations = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'allow' },
				graphql: {
					Query: {
						note: {
							authenticated: true,
							relations: [
								{
									require: [
										[{ relation: 'view', type: 'note', from: 'args.id' }],
									],
								},
							],
						},
					},
				},
			}),
		);
		const asked: unknown[] = [];
		const schema = guardSchema(fixtureSchema(), {
			policy: withRelations,
			claims: () => claims.reader,
			relations: () => ({
				check: async (queries) => {
					asked.push(...queries);
					return queries.map((q) => q.object.id === '1');
				},
			}),
		});
		expect((await run(schema, '{ note(id: 1) { id } }')).data).toEqual({
			note: { id: '1' },
		});
		const denied = await run(schema, '{ note(id: 2) { id } }');
		expect(denied.errors?.[0]?.extensions?.['status']).toBe(404);
		expect(asked).toHaveLength(2);
	});

	test('refuses a guarded schema, a bad option and a bad rule', () => {
		const once = guard();
		expect(() =>
			guardSchema(once, { policy, claims: () => claims.anon }),
		).toThrow('already guarded');
		expect(() => guardSchema(fixtureSchema(), {} as never)).toThrow(
			'guardSchema()',
		);
		expect(() =>
			guardSchema(fixtureSchema(SDL.replace('me: String', 'me: String!')), {
				policy,
				claims: () => claims.anon,
			}),
		).toThrow('Query.me');
	});

	test('claims that are not an object are a server error, not a refusal', async () => {
		const schema = guardSchema(fixtureSchema(), {
			policy,
			claims: () => null as never,
		});
		const result = await run(schema, '{ open }', {});
		expect(result.errors?.[0]?.originalError).toBeInstanceOf(TypeError);
	});

	test('a root-type field reached below another field carries no http', async () => {
		const schema = fixtureSchema(`
			type Query { secret: String }
			type Mutation { save: Saved }
			type Saved { ok: Boolean  query: Query }
		`);
		const mutation = schema.getMutationType()?.getFields()['save'];
		if (mutation) mutation.resolve = (() => ({ ok: true, query: {} })) as never;
		const guarded = guardSchema(schema, {
			policy: compilePolicy(
				definePolicy({
					limix: 1,
					global: { unmatched: 'allow' },
					graphql: { Query: { secret: { roles: [['admin']] } } },
				}),
			),
			claims: (ctx: { who: Claims }) => ctx.who,
		});
		const nested = await run(
			guarded,
			'mutation { save { ok query { secret } } }',
			as(claims.reader),
		);
		expect(nested.data).toEqual({
			save: { ok: true, query: { secret: null } },
		});
		expect(nested.errors?.[0]?.extensions?.['status']).toBe(403);
		expect(nested.errors?.[0]?.extensions?.['http']).toBeUndefined();
		const top = await run(guarded, '{ secret }', as(claims.reader));
		expect(top.errors?.[0]?.extensions?.['http']).toEqual({ status: 403 });
	});
});
