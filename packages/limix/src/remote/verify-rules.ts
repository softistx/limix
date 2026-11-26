import { createLocalJWKSet, type JSONWebKeySet } from 'jose';
import type { CompiledPolicy, Condition } from '../rules';
import { DEFAULT_TYP } from './defaults';
import { RemotePolicyError } from './errors';
import { verifyPolicyToken } from './verify';

/** What `verifyRules` checks a token against. */
export interface VerifyRulesOptions {
	/** Required `aud` of the token. */
	audience: string;
	/** Required `iss` whenever given. */
	issuer?: string;
	/** Required `typ` header; default `limix-rules+jwt`. */
	typ?: string;
	/** The predicates the rules' `when` may name; none when absent. */
	conditions?: Record<string, Condition>;
	/** Milliseconds since the epoch; default `Date.now`. */
	now?: () => number;
}

/** What a verified token carries. */
export interface VerifiedRules {
	ver: number;
	/** Seconds since the epoch. */
	iat: number;
	/** Seconds since the epoch; a token without one is refused. */
	exp: number;
	/** True when `exp` is not after `now`. */
	expired: boolean;
	/** The `schema` claim, when the token has one. */
	schema?: number;
	policy: CompiledPolicy;
}

/**
 * Verifies a rules token against a key set, with the checks `remotePolicy`
 * makes on a pull: asymmetric `alg`, `typ`, `aud`, `iss`, `iat` and `exp`
 * required, `schema`, and the rules compiled with `conditions`. A token past
 * its `exp` is still returned, with `expired: true`. Throws a
 * `RemotePolicyError` (`SIGNATURE`, `CLAIMS` or `RULES_REFUSED`); a key set
 * that is not a valid JWKS is `SIGNATURE`.
 */
export async function verifyRules(
	jws: string,
	jwks: JSONWebKeySet,
	options: VerifyRulesOptions,
): Promise<VerifiedRules> {
	let getKey: ReturnType<typeof createLocalJWKSet>;
	try {
		getKey = createLocalJWKSet(jwks);
	} catch (error) {
		throw new RemotePolicyError(
			'SIGNATURE',
			`the key set is malformed: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
	const verified = await verifyPolicyToken(jws, getKey, {
		typ: options.typ ?? DEFAULT_TYP,
		audience: options.audience,
		now: (options.now ?? Date.now)(),
		ignoreExpiry: true,
		source: 'the token',
		...(options.issuer ? { issuer: options.issuer } : {}),
		...(options.conditions ? { conditions: options.conditions } : {}),
	});
	return {
		ver: verified.ver,
		iat: verified.iat,
		exp: verified.exp,
		expired: verified.expired,
		policy: verified.policy,
		...(verified.schema !== undefined ? { schema: verified.schema } : {}),
	};
}
