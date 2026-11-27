import { describe, expect, test } from 'bun:test';
import { type Claims, compilePolicy, definePolicy } from '@softistx/limix';
import { buildSchema } from 'graphql';
import { entryOf, governs } from './governs';
import { guardSchema } from './guard';
import { claims, fixtureSchema, run } from './schema.fixtures';
import { checkPolicy } from './setup-check';

const policyOf = (graphql: Record<string, object>, unmatched = 'allow') =>
	compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: unmatched as 'allow' },
			graphql,
		} as never),
	);

const noteWildcard = policyOf({
	'Note.*': { authenticated: true },
	'Note.id': { public: true },
});
const as = (who: Claims) => ({ who });
const guard = (policy = noteWildcard, extra = {}) =>
	guardSchema(fixtureSchema(), {
		policy,
		claims: (ctx: { who: Claims }) => ctx.who,
		nonNull: 'allow',
		...extra,
	});

describe('entryOf and governs with Type.*', () => {
	test('fall back to the wildcard of the type, the exact field first', () => {
		expect(entryOf(noteWildcard, 'Note', 'title')?.wildcard).toBe(true);
		expect(entryOf(noteWildcard, 'Note', 'id')?.wildcard).toBe(false);
		expect(entryOf(noteWildcard, 'Query', 'open')).toBeUndefined();
		expect(governs(noteWildcard, 'Note', 'body', false)).toBe(true);
		expect(governs(noteWildcard, 'Query', 'open', true)).toBe(false);
	});
});

describe('guardSchema with a Note.* rule', () => {
	test('guards a field the wildcard covers: refused when anonymous, answered when signed in', async () => {
		const schema = guard();
		const anon = await run(
			schema,
			'{ note(id: 1) { id title } }',
			as(claims.anon),
		);
		expect(anon.errors?.[0]?.extensions).toMatchObject({
			code: 'auth.errors.unauthenticated',
			status: 401,
		});
		expect(anon.errors?.[0]?.path).toEqual(['note', 'title']);
		const reader = await run(
			schema,
			'{ note(id: 1) { id title body } }',
			as(claims.reader),
		);
		expect(reader).toEqual({
			data: { note: { id: '1', title: 'T', body: 'B' } },
		});
	});

	test('leaves the field with its own rule to that rule', async () => {
		const result = await run(
			guard(),
			'{ note(id: 1) { id } }',
			as(claims.anon),
		);
		expect(result).toEqual({ data: { note: { id: '1' } } });
	});

	test('guards a field reached through a list as well', async () => {
		const result = await run(guard(), '{ notes { title } }', as(claims.anon));
		expect(result.errors?.length).toBeGreaterThan(0);
	});

	test('a root wildcard governs every root field, under allow too', async () => {
		const schema = guard(policyOf({ 'Query.*': { roles: [['admin']] } }));
		expect(
			(await run(schema, '{ open }', as(claims.reader))).errors,
		).toHaveLength(1);
		expect(await run(schema, '{ open }', as(claims.admin))).toEqual({
			data: { open: 'open' },
		});
	});
});

describe('checkPolicy with Type.*', () => {
	const schema = fixtureSchema();

	test('accepts a wildcard on a known type, and refuses an unknown one', () => {
		expect(() =>
			checkPolicy(policyOf({ 'Query.*': { public: true } }), schema, 'allow'),
		).not.toThrow();
		expect(() =>
			checkPolicy(policyOf({ 'Nope.*': { public: true } }), schema, 'allow'),
		).toThrow('Nope: the schema has no such type');
	});

	test('names each non-null field a wildcard covers under nonNull: refuse', () => {
		const bad = policyOf({ 'Note.*': { public: true } });
		expect(() => checkPolicy(bad, schema, 'refuse')).toThrow(
			"Note.*: covers Note.id, which is non-null, so a refusal would null its parent; make it nullable, or pass `nonNull: 'allow'`",
		);
		expect(() => checkPolicy(bad, schema, 'allow')).not.toThrow();
	});

	test('a field with its own rule is judged by that rule, not by the wildcard', () => {
		const nullable = buildSchema('type Query { a: String! b: String }');
		const own = policyOf({
			'Query.*': { public: true },
			'Query.a': { public: true },
		});
		let message = '';
		try {
			checkPolicy(own, nullable, 'refuse');
		} catch (error) {
			message = (error as Error).message;
		}
		expect(message).toContain('Query.a: is non-null');
		expect(message).not.toContain('Query.*');
	});

	test('a wildcard over nullable fields passes', () => {
		const nullable = buildSchema('type Query { a: String b: String }');
		expect(() =>
			checkPolicy(
				policyOf({ 'Query.*': { public: true } }),
				nullable,
				'refuse',
			),
		).not.toThrow();
	});

	test('a subscription wildcard reading source is refused', () => {
		const sub = buildSchema(
			'type Query { a: String } type Subscription { s(id: ID): String }',
		);
		const rung = {
			relations: [
				{ require: [[{ relation: 'view', type: 'note', from: 'source.id' }]] },
			],
		};
		expect(() =>
			checkPolicy(policyOf({ 'Subscription.*': rung }), sub, 'refuse'),
		).toThrow('starts with no `source`');
	});
});
