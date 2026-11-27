import { agentTypeDefs } from '@softistx/graxia/agent';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { buildSchema } from 'graphql';

/** A schema carrying the agent directives, from the SDL of its types. */
export const schemaOf = (sdl: string) =>
	buildSchema(`${agentTypeDefs}\n${sdl}`);

type Document = Parameters<typeof definePolicy>[0];

/** A compiled policy from a document without its `limix` version. */
export const compiled = (
	document: Omit<Document, 'limix' | 'global'> &
		Partial<Pick<Document, 'global'>>,
) =>
	compilePolicy(
		definePolicy({ limix: 1, global: { unmatched: 'allow' }, ...document }),
	);

export const SDL = `
type Query {
  me: User
  books: [Book!]!
  secret: String
}
type Mutation {
  retire(id: ID!): Boolean
}
type User { id: ID! email: String }
type Book @needs(permission: "books:read") { id: ID! title: String }
`;
