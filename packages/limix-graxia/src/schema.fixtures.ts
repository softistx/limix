import type { Claims } from '@softistx/limix';
import { compilePolicy, definePolicy } from '@softistx/limix';
import {
	buildSchema,
	type GraphQLObjectType,
	type GraphQLSchema,
} from 'graphql';

export const SDL = /* GraphQL */ `
	type Query {
		open: String
		me: String
		secret: String
		note(id: ID!): Note
		notes: [Note!]!
		free: String
	}
	type Note { id: ID!  title: String  body: String }
	type Mutation { updateNote(id: ID!): Note }
	type Subscription { noteChanged(id: ID!): Note }
`;

export const claims = {
	anon: { authenticated: false } satisfies Claims,
	reader: {
		authenticated: true,
		subject: { type: 'user', id: 'u1' },
	} satisfies Claims,
	admin: {
		authenticated: true,
		subject: { type: 'user', id: 'u2' },
		roles: ['admin'],
		scope: 'notes:write',
	} satisfies Claims,
};

export const rules = definePolicy({
	limix: 1,
	global: { unmatched: 'deny' },
	graphql: {
		Query: {
			open: { public: true },
			me: { authenticated: true },
			secret: { roles: [['admin']] },
			free: { public: true },
		},
		Mutation: { updateNote: { permissions: [['notes:write']] } },
		Subscription: { noteChanged: { authenticated: true } },
		Note: { body: { authenticated: true } },
	},
});

export const policy = compilePolicy(rules);

/** The schema's resolvers, attached to a fresh `buildSchema` result. */
export function fixtureSchema(sdl = SDL): GraphQLSchema {
	const schema = buildSchema(sdl);
	const note = { id: '1', title: 'T', body: 'B' };
	const set = (type: string, field: string, resolve: unknown) => {
		const found = (
			schema.getType(type) as GraphQLObjectType | undefined
		)?.getFields()[field];
		if (found) found.resolve = resolve as never;
	};
	set('Query', 'open', () => 'open');
	set('Query', 'me', () => 'me');
	set('Query', 'secret', () => 'secret');
	set('Query', 'free', () => 'free');
	set('Query', 'note', () => note);
	set('Query', 'notes', () => [note]);
	set('Mutation', 'updateNote', () => note);
	const found = schema.getSubscriptionType()?.getFields()['noteChanged'];
	if (found) {
		found.subscribe = async function* () {
			yield { id: '1', title: 'A', body: 'ba' };
			yield { id: '2', title: 'B', body: 'bb' };
		} as never;
		found.resolve = ((payload: unknown) => payload) as never;
	}
	return schema;
}

/** Runs a query with graphql-js and returns the plain result. */
export async function run(
	schema: GraphQLSchema,
	source: string,
	contextValue: unknown = {},
) {
	const { graphql } = await import('graphql');
	return graphql({ schema, source, contextValue });
}
