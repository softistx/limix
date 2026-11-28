import type { ModuleInput } from './module';
import { openapiOperations } from './openapi';

/** The GraphQL schema of the notes example. */
export const FIXTURE_SDL = `
type Query {
  me: Note
}

type Mutation {
  createNote(body: String!): Note
}

type Note {
  body: String
}
`;

/** The OpenAPI document of the notes example, as an object. */
export const FIXTURE_OPENAPI = {
	openapi: '3.1.0',
	info: { title: 'Notes', version: '1' },
	paths: {
		'/notes': { get: { responses: {} } },
		'/notes/{id}': { get: { responses: {} }, delete: { responses: {} } },
	},
};

/** The same document, as a YAML file holds it. */
export const FIXTURE_OPENAPI_YAML = `openapi: 3.1.0
info:
  title: Notes
  version: "1"
paths:
  /notes:
    get:
      responses: {}
  /notes/{id}:
    get:
      responses: {}
    delete:
      responses: {}
`;

/** The input behind `generated.fixtures.ts`, in the notes example. */
export const FIXTURE_INPUT: ModuleInput = {
	sources: ['schema.graphql', 'openapi.yaml'],
	rest: openapiOperations(FIXTURE_OPENAPI),
	graphql: [
		{ kind: 'graphql', type: 'Query', field: 'me', root: true },
		{ kind: 'graphql', type: 'Mutation', field: 'createNote', root: true },
		{ kind: 'graphql', type: 'Note', field: 'body', root: false },
	],
};
