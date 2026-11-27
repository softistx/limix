import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { call, ok, whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import { alxiaOperations } from '../operations';
import type { LimixAlxiaOptions } from '../options';
import { gqlPolicy, query, schema } from './graphql.fixtures';
import { limixGraphql } from './limix-graphql';

type Options = LimixAlxiaOptions<{ request: Request }>;
const optionsOf = (app: ReturnType<typeof alxia>): Options => ({
	policy: gqlPolicy,
	claims: whoOf,
	app,
});
const paths = (app: ReturnType<typeof alxia>) =>
	alxiaOperations(app).map((o) => `${o.method} ${o.path}`);

describe('the endpoint limixGraphql declared is exempted by its handler, on the app the guard sits on', () => {
	test('shared options: another app, or the same one, REST POST /graphql is judged by the rules', async () => {
		const a = alxia();
		const limix = optionsOf(a);
		a.use(limixGuard(limix));
		a.get('/open', ok);
		a.post('/graphql', ({ reply }) => reply(200, { restHandler: true }));
		limixGraphql(alxia(), { schema: schema(), limix });
		const refused = await query(a, '{ secret }');
		expect(refused.status).toBe(401);
		expect(await refused.text()).not.toContain('restHandler');
		expect(paths(a)).toContain('POST /graphql');
	});

	test('a plugin app mounted without a prefix keeps its endpoint exempt and out of the REST list', async () => {
		const app = alxia();
		const limix = optionsOf(app);
		app.use(limixGuard(limix));
		app.get('/open', ok);
		const gql = alxia();
		limixGraphql(gql, { schema: schema(), limix });
		app.plugin(gql);
		const served = await query(app, '{ open }');
		expect(served.status).toBe(200);
		expect(await served.json()).toEqual({ data: { open: 'open' } });
		expect((await query(app, '{ secret }')).status).toBe(401);
		expect(paths(app)).toEqual(['GET /open', 'HEAD /open']);
	});

	test('a plugin app mounted under a prefix does too', async () => {
		const app = alxia({ prefix: '/api' });
		const limix = optionsOf(app);
		app.use(limixGuard(limix));
		app.get('/open', ok);
		const gql = alxia();
		limixGraphql(gql, { schema: schema(), limix });
		app.plugin(gql);
		const served = await app.fetch(
			new Request('http://localhost/api/graphql', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: '{ open }' }),
			}),
		);
		expect(served.status).toBe(200);
		expect(paths(app)).toEqual(['GET /api/open', 'HEAD /api/open']);
	});

	test('a group mounting limixGraphql is exempt under its prefix', async () => {
		const app = alxia();
		const limix = optionsOf(app);
		app.use(limixGuard(limix));
		app.get('/open', ok);
		app.group('/v1', (g) => limixGraphql(g, { schema: schema(), limix }));
		const served = await app.fetch(
			new Request('http://localhost/v1/graphql', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ query: '{ open }' }),
			}),
		);
		expect(served.status).toBe(200);
		expect(paths(app)).toEqual(['GET /open', 'HEAD /open']);
	});

	test('the endpoint declared before the guard needs no REST rule either', async () => {
		const app = alxia();
		const limix = optionsOf(app);
		limixGraphql(app, { schema: schema(), limix });
		app.use(limixGuard(limix));
		app.get('/open', ok);
		expect((await query(app, '{ open }')).status).toBe(200);
		expect((await call(app, '/open')).status).toBe(200);
	});
});
