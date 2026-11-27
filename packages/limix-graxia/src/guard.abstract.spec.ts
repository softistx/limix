import { describe, expect, test } from 'bun:test';
import {
	type Claims,
	compilePolicy,
	definePolicy,
	LimixRefusal,
} from '@softistx/limix';
import {
	buildSchema,
	type GraphQLObjectType,
	type GraphQLSchema,
	validateSchema,
} from 'graphql';
import { guardSchema } from './guard';
import { claims, run } from './schema.fixtures';

const as = (c: Claims) => ({ who: c });
const options = (
	graphql: Record<string, Record<string, unknown>>,
	deny = false,
) => ({
	policy: compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: deny ? 'deny' : 'allow' },
			graphql: graphql as never,
		}),
	),
	claims: (ctx: { who: Claims }) => ctx.who,
});

/** Sets the resolver of `type.field`, failing the spec if the schema has no such field. */
function resolveWith(
	schema: GraphQLSchema,
	type: string,
	field: string,
	resolve: () => unknown,
): void {
	const found = (schema.getType(type) as GraphQLObjectType)?.getFields()[field];
	if (!found) throw new Error(`no ${type}.${field}`);
	found.resolve = resolve;
}

const ABSTRACT = `
	interface Node { id: ID  secret: String }
	type Note implements Node { id: ID  secret: String }
	type Memo implements Node { id: ID  secret: String }
	union Thing = Note | Memo
	type Query { node: Node  thing: Thing }
`;

function abstractSchema(isTypeOf: boolean) {
	const schema = buildSchema(ABSTRACT);
	const value = isTypeOf
		? { kind: 'note', id: '1', secret: 's' }
		: { __typename: 'Note', id: '1', secret: 's' };
	resolveWith(schema, 'Query', 'node', () => value);
	resolveWith(schema, 'Query', 'thing', () => value);
	if (isTypeOf) {
		for (const name of ['Note', 'Memo']) {
			(schema.getType(name) as GraphQLObjectType).isTypeOf = (v: unknown) =>
				(v as { kind: string }).kind === name.toLowerCase();
		}
	}
	return schema;
}

describe('guardSchema, abstract types', () => {
	for (const isTypeOf of [false, true]) {
		const how = isTypeOf ? 'isTypeOf' : '__typename';
		test(`a rule on an object field reached through an interface or a union holds (resolved by ${how})`, async () => {
			const schema = guardSchema(
				abstractSchema(isTypeOf),
				options({ Note: { secret: { roles: [['admin']] } } }),
			);
			expect(validateSchema(schema)).toEqual([]);
			for (const query of [
				'{ node { id ... on Note { secret } } }',
				'{ thing { ... on Note { secret } } }',
				'{ node { secret } }',
			]) {
				const refused = await run(schema, query, as(claims.reader));
				expect(refused.errors?.[0]?.extensions).toMatchObject({
					code: 'auth.errors.forbidden',
					status: 403,
				});
				const allowed = await run(schema, query, as(claims.admin));
				expect(allowed.errors).toBeUndefined();
				expect(JSON.stringify(allowed.data)).toContain('"secret":"s"');
			}
		});
	}
});

describe('guardSchema, renamed roots', () => {
	const SDL = `
		schema { query: Root  mutation: Change }
		type Root { a: String  b: String }
		type Change { c: String }
	`;
	function schema() {
		const built = buildSchema(SDL);
		resolveWith(built, 'Root', 'a', () => 'ok');
		resolveWith(built, 'Root', 'b', () => 'ok');
		resolveWith(built, 'Change', 'c', () => 'ok');
		return built;
	}

	test('a field of a renamed root no rule names is denied under unmatched: deny', async () => {
		const guarded = guardSchema(
			schema(),
			options({ Root: { a: { public: true } } }, true),
		);
		expect((await run(guarded, '{ a }', as(claims.anon))).data).toEqual({
			a: 'ok',
		});
		const denied = await run(guarded, '{ b }', as(claims.admin));
		expect(denied.errors?.[0]?.extensions).toMatchObject({
			code: 'auth.errors.forbidden',
			http: { status: 403 },
		});
		const mutation = await run(guarded, 'mutation { c }', as(claims.admin));
		expect(mutation.errors?.[0]?.extensions?.['status']).toBe(403);
	});

	test('a refusal a resolver throws is not touched by the guard', async () => {
		const built = schema();
		resolveWith(built, 'Root', 'a', () => {
			throw new LimixRefusal('auth.errors.forbidden', 403);
		});
		const guarded = guardSchema(
			built,
			options({ Root: { a: { public: true } } }, true),
		);
		const result = await run(guarded, '{ a }', as(claims.admin));
		expect(result.errors?.[0]?.originalError).toBeInstanceOf(LimixRefusal);
	});
});
