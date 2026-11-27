import type { Claims } from '@softistx/limix';

/**
 * DEMO ONLY. Do not copy this into a real service.
 *
 * `Authorization: Bearer alice` is not a credential: anybody can type it. A
 * real app verifies a signed token (a JWT, a session, an introspection call)
 * and builds the claims from what the issuer vouches for. limix trusts
 * whatever `claims` returns, so everything here is the part you must replace.
 */
const USERS: Readonly<Record<string, Claims>> = {
	reader: {
		authenticated: true,
		subject: { type: 'user', id: 'reader' },
		userId: 'reader',
		roles: ['reader'],
		scope: 'books:read',
	},
	alice: {
		authenticated: true,
		subject: { type: 'user', id: 'alice' },
		userId: 'alice',
		roles: ['editor'],
		scope: 'books:read books:write',
	},
	bob: {
		authenticated: true,
		subject: { type: 'user', id: 'bob' },
		userId: 'bob',
		roles: ['editor'],
		scope: 'books:read books:write',
	},
	admin: {
		authenticated: true,
		subject: { type: 'user', id: 'admin' },
		userId: 'admin',
		roles: ['admin'],
		scope: 'books:read books:write',
	},
};

const ANONYMOUS: Claims = { authenticated: false };

/** The demo users, by the name sent after `Bearer`. */
export const DEMO_USERS: readonly string[] = Object.keys(USERS);

/** Who is calling: an unknown or missing name is anonymous. */
export function demoClaims(ctx: { request: Request }): Claims {
	const header = ctx.request.headers.get('authorization') ?? '';
	const name = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
	return USERS[name] ?? ANONYMOUS;
}
