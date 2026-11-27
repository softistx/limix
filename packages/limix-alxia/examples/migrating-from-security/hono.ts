import {
	type Claims,
	type CompiledPolicy,
	compilePolicy,
	definePolicy,
	evaluateRest,
	type PolicySource,
	type RelationChecker,
} from '@softistx/limix';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type Env = { Variables: { claims: Claims } };
const ANONYMOUS: Claims = { authenticated: false };

// was: policyGuard(rawRules, { getClaims }) and an `app.onError` for PolicyRefusal.
export function limixHono(
	policy: CompiledPolicy | PolicySource,
	relations?: RelationChecker,
) {
	return createMiddleware<Env>(async (c, next) => {
		// A relation term reading `json.` needs the body: read a clone, so the handler's stream is untouched.
		const json = c.req.header('content-type')?.includes('json')
			? await c.req.raw
					.clone()
					.json()
					.catch(() => undefined)
			: undefined;
		const decision = await evaluateRest(policy, {
			method: c.req.method,
			path: c.req.path,
			claims: c.get('claims') ?? ANONYMOUS,
			request: { query: c.req.query(), json },
			relations,
			info: c, // what a `when` condition receives as `info`
		});
		if (decision.allow) return next();
		const { code, status, params } = decision.refusal;
		return c.json(
			Object.keys(params).length > 0 ? { code, params } : { code },
			status as ContentfulStatusCode,
		);
	});
}

export const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny', basePath: '/api' },
		rest: {
			'/notes/:id': {
				GET: { authenticated: true },
				POST: { authenticated: true },
			},
		},
	}),
);

export const app = new Hono<Env>();

// Your authentication middleware (here: the bearer is the user id).
app.use('/api/*', async (c, next) => {
	const token = c.req.header('authorization')?.replace(/^Bearer /, '');
	c.set(
		'claims',
		token
			? { authenticated: true, subject: { type: 'user', id: token } }
			: ANONYMOUS,
	);
	await next();
});
app.use('/api/*', limixHono(policy));
app.get('/api/notes/:id', (c) => c.json({ id: c.req.param('id') }));
app.post('/api/notes/:id', async (c) =>
	c.json({ raw: await c.req.raw.text() }),
);
