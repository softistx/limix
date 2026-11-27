import {
	type Claims,
	type CompiledPolicy,
	evaluateField,
	isLimixRefusal,
} from '@softistx/limix';

export async function mayReadMe(policy: CompiledPolicy, claims: Claims) {
	const decision = await evaluateField(policy, {
		type: 'Query',
		field: 'me',
		claims,
	});
	return decision.allow ? 'allowed' : decision.refusal.code;
}

// A resolver that throws a refusal of its own is recognised the same way.
export function onError(error: unknown) {
	return isLimixRefusal(error)
		? { code: error.code, status: error.status }
		: undefined;
}
