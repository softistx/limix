import {
	type Claims,
	type CompiledPolicy,
	evaluateRest,
} from '@softistx/limix';

// What the 5.x `PolicyClaims` literal `{ sub, authorities }` becomes: the
// caller is `subject`, and a caller with no `sub` is anonymous.
export function claimsOf(
	token: { sub?: string; roles?: string[]; scope?: string } | undefined,
): Claims {
	if (token?.sub === undefined) return { authenticated: false };
	return {
		authenticated: true,
		subject: { type: 'user', id: token.sub },
		roles: token.roles ?? [],
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
