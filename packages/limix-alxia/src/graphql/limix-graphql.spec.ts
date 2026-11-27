import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy, mutableSource } from '@softistx/limix';
import { call, ok, whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import { alxiaOperations } from '../operations';
import { gqlPolicy, graphqlApp, query, schema } from './graphql.fixtures';
import { limixGraphql } from './limix-graphql';

beforeEach(() => {
	spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => mock.restore());

describe('limixGraphql', () => {
	test('an open field is served though no REST rule names /graphql', async () => {
		const { app } = graphqlApp();
		const res = await query(app, '{ open }');
		expect([res.status, await res.json()]).toEqual([
			200,
			{ data: { open: 'open' } },
		]);
	});

	test('a refused top-level field is the HTTP status of its refusal', async () => {
		const { app } = graphqlApp();
		const anon = await query(app, '{ me }');
		expect(anon.status).toBe(401);
		expect((await anon.json()).errors[0].extensions).toMatchObject({
			code: 'auth.errors.unauthenticated',
			status: 401,
		});
		expect((await query(app, '{ secret }', 'reader')).status).toBe(403);
		expect((await query(app, '{ secret }', 'admin')).status).toBe(200);
	});

	test('a nested refusal keeps the partial data at 200', async () => {
		const { app } = graphqlApp();
		const res = await query(app, '{ note { id body } }');
		expect(res.status).toBe(200);
		const body = await res.json();
		expect(body.data).toEqual({ note: { id: '1', body: null } });
		expect(body.errors[0].extensions.code).toBe('auth.errors.unauthenticated');
	});

	test('a field no rule names is refused under deny, even for an admin', async () => {
		const { app } = graphqlApp();
		const res = await query(app, '{ other }', 'admin');
		expect((await res.json()).errors[0].extensions.code).toBe(
			'auth.errors.forbidden',
		);
	});

	test('the claims are read once per operation, however many fields', async () => {
		let reads = 0;
		const { app } = graphqlApp({
			claims: (ctx) => {
				reads++;
				return whoOf(ctx);
			},
		});
		await query(app, '{ me secret note { body } }', 'admin');
		expect(reads).toBe(1);
	});

	test('the REST routes of the same app are still judged by the REST rules', async () => {
		const { app } = graphqlApp();
		expect((await call(app, '/open')).status).toBe(200);
	});

	test('the endpoint is left out of alxiaOperations', () => {
		const { app } = graphqlApp();
		expect(alxiaOperations(app).map((o) => `${o.method} ${o.path}`)).toEqual([
			'GET /open',
			'HEAD /open',
		]);
	});

	test('a source holding no policy is 503 with retry-after, then serves once one is swapped in', async () => {
		const source = mutableSource();
		const { app } = graphqlApp({ policy: source });
		const res = await query(app, '{ open }');
		expect(res.status).toBe(503);
		expect(res.headers.get('retry-after')).toBe('5');
		source.swap(gqlPolicy);
		expect((await query(app, '{ open }')).status).toBe(200);
	});

	test('a source holding a policy that does not fit the schema is 503 policy-mismatch', async () => {
		const wrong = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'allow' },
				graphql: { Query: { ghost: { public: true } } },
			}),
		);
		const { app } = graphqlApp({ policy: mutableSource(wrong) });
		const res = await query(app, '{ open }');
		expect(res.status).toBe(503);
		expect((await res.json()).errors[0].extensions.params).toEqual({
			reason: 'policy-mismatch',
		});
	});

	test('a copy of the options still leaves the endpoint to the field guard: it is known by its handler on the guarded app', async () => {
		const app = alxia();
		const limix = { policy: gqlPolicy, claims: whoOf, app };
		app.use(limixGuard(limix));
		app.get('/open', ok);
		limixGraphql(app, { schema: schema(), limix: { ...limix } });
		const res = await query(app, '{ open }', 'admin');
		expect(res.status).toBe(200);
	});
});

describe('limixGraphql, setup', () => {
	test('wrong limix options throw naming limixGraphql()', () => {
		const app = alxia();
		expect(() =>
			limixGraphql(app, {
				schema: schema(),
				limix: { policy: gqlPolicy } as never,
			}),
		).toThrow(/^limixGraphql\(\): pass `claims`/);
	});

	test('a rung code outside auth.errors. throws', () => {
		const bad = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'allow' },
				graphql: {
					Query: {
						me: {
							relations: [
								{
									code: 'app.errors.nope',
									require: [[{ relation: 'v', type: 'note', from: 'args.id' }]],
								},
							],
						},
					},
				},
			}),
		);
		const app = alxia();
		expect(() =>
			limixGraphql(app, {
				schema: schema(),
				limix: {
					policy: bad,
					claims: whoOf,
					app,
					relations: { check: async (q) => q.map(() => true) },
				},
			}),
		).toThrow(/outside `auth\.errors\.`/);
	});

	test('a schema the policy does not fit is refused at setup by the field guard', () => {
		const wrong = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'allow' },
				graphql: { Query: { ghost: { public: true } } },
			}),
		);
		const app = alxia();
		expect(() =>
			limixGraphql(app, {
				schema: schema(),
				limix: { policy: wrong, claims: whoOf, app },
			}),
		).toThrow(/does not fit the schema/);
	});
});
