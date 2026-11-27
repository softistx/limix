import {
	type Claims,
	type CompiledPolicy,
	evaluateRest,
} from '@softistx/limix';

interface Token {
	sub?: string | null;
	clientId?: string | null;
	authorities?: string[];
	roles?: string[];
	scope?: string;
}

// What a 5.x `PolicyClaims` becomes. The caller is signed in when `sub` or
// `clientId` is truthy, as in 5.x, and `subject` is who the relations are asked about.
export function claimsOf(
	token: Token | undefined,
	options: { scopeAsRoles?: boolean } = {},
): Claims {
	if (!token?.sub && !token?.clientId) {
		return { authenticated: false };
	}
	// 5.x read `authorities`, `roles` and the tokens of `scope` together as one set
	// (evaluation.utils.ts of @softistx/security). `roles` reads `claims.roles` only,
	// so `scopeAsRoles` keeps a rule that named a scope token under `roles`; prefer a
	// `permissions` term for those.
	const scopeTokens = options.scopeAsRoles
		? (token.scope ?? '').split(' ').filter(Boolean)
		: [];
	return {
		authenticated: true,
		// 5.x asked relations about `sub` alone: a `clientId`-only caller has no
		// subject, and a rule with relations answers 403 `no-subject`.
		...(token.sub ? { subject: { type: 'user', id: token.sub } } : {}),
		roles: [
			...new Set([
				...(token.authorities ?? []),
				...(token.roles ?? []),
				...scopeTokens,
			]),
		],
		...(token.scope === undefined ? {} : { scope: token.scope }),
	};
}

export async function mayDelete(
	policy: CompiledPolicy,
	claims: Claims,
	id: string,
) {
	const decision = await evaluateRest(policy, {
		method: 'DELETE',
		path: `/notes/${id}`,
		claims,
	});
	if (decision.allow) return { status: 200 };
	return { status: decision.refusal.status, code: decision.refusal.code };
}
