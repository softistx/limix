import { describe, expect, test } from 'bun:test';
import { compilePolicy, definePolicy, mutableSource } from '@softistx/limix';
import { guardSchema } from './guard';
import { claims, fixtureSchema, policy, run } from './schema.fixtures';

const open = compilePolicy(
	definePolicy({ limix: 1, global: { unmatched: 'allow' }, graphql: {} }),
);

describe('guardSchema, policy source', () => {
	test('holds no policy: every field answers 503 with retry-after, and onUnavailable fires once', async () => {
		const source = mutableSource();
		let reports = 0;
		const schema = guardSchema(fixtureSchema(), {
			policy: source,
			claims: () => claims.admin,
			onUnavailable: () => reports++,
		});
		const first = await run(schema, '{ open me }');
		expect(first.errors?.map((e) => e.extensions?.['code'])).toEqual([
			'limix.errors.unavailable',
			'limix.errors.unavailable',
		]);
		expect(first.errors?.[0]?.extensions).toMatchObject({
			status: 503,
			params: { reason: 'no-policy' },
			http: { status: 503, headers: { 'retry-after': '5' } },
		});
		await run(schema, '{ open }');
		expect(reports).toBe(1);
		source.swap(policy);
		expect((await run(schema, '{ open }')).data).toEqual({ open: 'open' });
		source.swap(null);
		await run(schema, '{ open }');
		expect(reports).toBe(2);
	});

	test('follows a swap of the policy without a new schema', async () => {
		const source = mutableSource(policy);
		const schema = guardSchema(fixtureSchema(), {
			policy: source,
			claims: () => claims.anon,
		});
		expect((await run(schema, '{ me }')).errors).toHaveLength(1);
		source.swap(open);
		expect((await run(schema, '{ me }')).data).toEqual({ me: 'me' });
	});

	test('a field with no rule passes through without reading the claims', async () => {
		let reads = 0;
		const schema = guardSchema(fixtureSchema(), {
			policy: mutableSource(open),
			claims: () => {
				reads++;
				return claims.admin;
			},
		});
		expect((await run(schema, '{ note(id: 1) { title } }')).data).toEqual({
			note: { title: 'T' },
		});
		expect(reads).toBe(0);
	});

	test('the passthrough is synchronous: the resolver value comes back as it is', () => {
		const schema = guardSchema(fixtureSchema(), {
			policy: mutableSource(open),
			claims: () => claims.admin,
		});
		const field = schema.getQueryType()?.getFields()['open'];
		expect(field?.resolve?.({}, {}, {}, {} as never)).toBe('open');
	});

	test('a non-null field is not checked (a source may swap in a rule later)', () => {
		expect(() =>
			guardSchema(fixtureSchema('type Query { me: String! }'), {
				policy: mutableSource(policy),
				claims: () => claims.anon,
			}),
		).not.toThrow();
	});

	describe('a held policy that does not fit the schema', () => {
		const SDL = `
			interface Node { id: ID }
			type Thing implements Node { id: ID }
			type Query { open: String  thing: Thing }
		`;
		const withRules = (graphql: Record<string, Record<string, unknown>>) =>
			compilePolicy(
				definePolicy({
					limix: 1,
					global: { unmatched: 'allow' },
					graphql: graphql as never,
				}),
			);
		const fits = withRules({ Query: { open: { public: true } } });
		const misfits = {
			'a rule on an interface': withRules({ Node: { id: { public: true } } }),
			'a rule on an unknown type': withRules({
				Ghost: { id: { public: true } },
			}),
			'a misspelt field': withRules({ Query: { opne: { public: true } } }),
		};

		for (const [name, bad] of Object.entries(misfits)) {
			test(`${name} is refused as unavailable (policy-mismatch) until a fitting policy is swapped in`, async () => {
				const source = mutableSource(bad);
				let reports = 0;
				const schema = guardSchema(fixtureSchema(SDL), {
					policy: source,
					claims: () => claims.admin,
					onUnavailable: () => reports++,
				});
				const refused = await run(schema, '{ open }');
				expect(refused.data).toEqual({ open: null });
				expect(refused.errors?.[0]?.extensions).toMatchObject({
					code: 'limix.errors.unavailable',
					status: 503,
					params: { reason: 'policy-mismatch' },
					http: { status: 503, headers: { 'retry-after': '5' } },
				});
				await run(schema, '{ open thing { id } }');
				expect(reports).toBe(1);
				source.swap(fits);
				expect((await run(schema, '{ open }')).data).toEqual({ open: 'open' });
				source.swap(bad);
				await run(schema, '{ open }');
				expect(reports).toBe(2);
			});
		}
	});
});
