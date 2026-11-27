import { alxia, type FreeReplyFunction } from '@softistx/alxia';
import {
	type Claims,
	compilePolicy,
	definePolicy,
	type RelationChecker,
} from '@softistx/limix';
import { limixGuard } from './guard';
import type { LimixAlxiaOptions } from './options';

export const claims = {
	anon: { authenticated: false } satisfies Claims,
	reader: {
		authenticated: true,
		roles: ['reader'],
		subject: { type: 'user', id: 'u1' },
	} satisfies Claims,
	admin: {
		authenticated: true,
		roles: ['admin'],
		subject: { type: 'user', id: 'u2' },
	} satisfies Claims,
};

/** Who is calling, read off the `x-who` header: `anon` (default), `reader` or `admin`. */
export function whoOf(ctx: { request: Request }): Claims {
	const who = ctx.request.headers.get('x-who');
	return who === 'admin' || who === 'reader' ? claims[who] : claims.anon;
}

/** A policy with a bit of everything, under `unmatched: deny`. */
export const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/open': { GET: { public: true } },
			'/me': { GET: { authenticated: true } },
			'/notes/:id': {
				GET: { roles: [['reader'], ['admin']] },
				DELETE: { roles: [['admin']] },
			},
			'/notes': { POST: { roles: [['admin']] } },
			'/files/*path': { GET: { authenticated: true } },
		},
	}),
);

export const allowAll = compilePolicy(
	definePolicy({ limix: 1, global: { unmatched: 'allow' } }),
);

/** A policy that asks the relations port about the note in the path. */
export const withRelations = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/notes/:id': {
				GET: {
					authenticated: true,
					relations: [
						{
							require: [
								[{ relation: 'viewer', type: 'note', from: 'param.id' }],
							],
						},
					],
				},
			},
		},
	}),
);

/** A relations port that answers from a list of `type:id` the caller may see, and counts its calls. */
export function fakeRelations(allowed: string[]) {
	const state = { calls: 0 };
	const checker: RelationChecker = {
		check: async (queries) => {
			state.calls++;
			return queries.map((q) =>
				allowed.includes(`${q.object.type}:${q.object.id}`),
			);
		},
	};
	return Object.assign(checker, { state });
}

/** An app with the routes the fixtures' policy names, each answering `{ ok: <label> }`. */
export function routesOn<A extends ReturnType<typeof alxia>>(app: A): A {
	return app
		.get('/open', ({ reply }) => reply(200, { ok: 'open' }))
		.get('/me', ({ reply }) => reply(200, { ok: 'me' }))
		.get('/notes/:id', ({ reply }) => reply(200, { ok: 'note' }))
		.delete('/notes/:id', ({ reply }) => reply(200, { ok: 'deleted' }))
		.post('/notes', ({ reply }) => reply(200, { ok: 'created' }))
		.get('/files/*', ({ reply }) => reply(200, { ok: 'file' })) as A;
}

export const call = (
	app: { fetch(request: Request): Response | Promise<Response> },
	path: string,
	init: RequestInit & { who?: 'admin' | 'reader' } = {},
) => {
	const { who, ...rest } = init;
	const headers = new Headers(rest.headers);
	if (who) headers.set('x-who', who);
	return Promise.resolve(
		app.fetch(new Request(`http://localhost${path}`, { ...rest, headers })),
	);
};

/** A handler answering `{}`, for a route a spec only declares. */
export const ok = ({ reply }: { reply: FreeReplyFunction }) => reply(200, {});

/** An alxia app with the fixtures' routes behind `limixGuard`; `extra` overrides the guard's options. */
export function guardedApp(
	extra: Partial<LimixAlxiaOptions<{ request: Request }>> = {},
	errors: 'json' | 'problem' = 'json',
) {
	const app = alxia({ errors });
	app.use(limixGuard({ policy, claims: whoOf, app, ...extra }));
	return routesOn(app);
}
