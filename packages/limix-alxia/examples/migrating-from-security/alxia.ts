import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { type LimixAlxiaOptions, limixGuard } from '@softistx/limix-alxia';
import { limixGraphql } from '@softistx/limix-alxia/graphql';
import { buildSchema } from 'graphql';

const schema = buildSchema('type Query { me: String }');
export const app = alxia();

const limix: LimixAlxiaOptions<{ request: Request }> = {
	policy: compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: { '/notes/:id': { GET: { authenticated: true } } },
			graphql: { Query: { me: { authenticated: true } } },
		}),
	),
	claims: (ctx) => ({
		authenticated: ctx.request.headers.has('authorization'),
	}),
	app,
};

// Before the routes it judges: a route declared above it stays open.
app.use(limixGuard(limix));
app.get('/notes/:id', ({ reply }) => reply(200, { note: true }));

// was: graphql(app, { schema: applyGraphqlPolicy(schema, rawRules, { getClaims }), plugins })
limixGraphql(app, { schema, limix }); // the same `limix` object as the guard
