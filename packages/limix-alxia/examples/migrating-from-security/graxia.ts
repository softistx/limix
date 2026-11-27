import { createGraxia } from '@softistx/graxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { guardSchema, limixGraxia } from '@softistx/limix-graxia';
import { buildSchema } from 'graphql';

const schema = buildSchema(`
  type Query { me: String  notes: [String!] }
  type Mutation { retire(id: ID!): Boolean }
`);

const options = {
	policy: compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			graphql: {
				Query: { me: { authenticated: true }, notes: { public: true } },
				Mutation: { retire: { permissions: [['notes:retire']] } },
			},
		}),
	),
	// was: getClaims. Read once per operation, from what your `context` option returned.
	claims: (ctx: { request: Request }) => ({
		authenticated: ctx.request.headers.has('authorization'),
		scope: ctx.request.headers.get('x-scope') ?? '',
	}),
};

export const graxia = createGraxia({
	schema: guardSchema(schema, options), // was: applyGraphqlPolicy(schema, rawRules, { getClaims, permissions, logger, strict })
	plugins: [limixGraxia(options)],
	context: ({ request }: { request: Request }) => ({ request }),
});
