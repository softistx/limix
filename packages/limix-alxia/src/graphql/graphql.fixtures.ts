import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { buildSchema, type GraphQLObjectType } from 'graphql';
import { ok, whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import type { LimixAlxiaOptions } from '../options';
import { limixGraphql } from './limix-graphql';

export const SDL = /* GraphQL */ `
	type Query { open: String  me: String  secret: String  note: Note  other: String }
	type Note { id: ID!  title: String  body: String }
`;

export const gqlPolicy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/open': { GET: { public: true } } },
		graphql: {
			Query: {
				open: { public: true },
				me: { authenticated: true },
				secret: { roles: [['admin']] },
				note: { public: true },
			},
			Note: { body: { authenticated: true } },
		},
	}),
);

export function schema() {
	const built = buildSchema(SDL);
	const set = (type: string, field: string, resolve: () => unknown) => {
		const found = (built.getType(type) as GraphQLObjectType).getFields()[field];
		if (found) found.resolve = resolve as never;
	};
	set('Query', 'open', () => 'open');
	set('Query', 'me', () => 'me');
	set('Query', 'secret', () => 'secret');
	set('Query', 'other', () => 'other');
	set('Query', 'note', () => ({ id: '1', title: 'T', body: 'B' }));
	return built;
}

/** An app with the REST guard, a REST route and the GraphQL endpoint, all on one options object. */
export function graphqlApp(
	extra: Partial<LimixAlxiaOptions<{ request: Request }>> = {},
	graphqlExtra: { mapRefusal?: never; nonNull?: 'allow' | 'refuse' } = {},
) {
	const app = alxia();
	const limix: LimixAlxiaOptions<{ request: Request }> = {
		policy: gqlPolicy,
		claims: whoOf,
		app,
		...extra,
	};
	app.use(limixGuard(limix));
	app.get('/open', ok);
	limixGraphql(app, { schema: schema(), limix, ...graphqlExtra });
	return { app, limix };
}

export const query = (
	app: { fetch(r: Request): Response | Promise<Response> },
	source: string,
	who?: 'admin' | 'reader',
) =>
	Promise.resolve(
		app.fetch(
			new Request('http://localhost/graphql', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					...(who ? { 'x-who': who } : {}),
				},
				body: JSON.stringify({ query: source }),
			}),
		),
	);
