import {
	decodeJwt,
	errors,
	type JWTPayload,
	type JWTVerifyGetKey,
	type JWTVerifyOptions,
	jwtVerify,
} from 'jose';
import {
	type CompiledPolicy,
	type Condition,
	compilePolicy,
	LIMIX_FORMAT_VERSION,
	parseRules,
	RulesError,
} from '../rules';
import { RemotePolicyError } from './errors';

/** Asymmetric only: a shared secret cannot tell a publisher from a reader. */
export const ALGORITHMS = ['RS256', 'PS256', 'ES256', 'EdDSA'] as const;

export interface VerifyOptions {
	typ: string;
	/** The predicates the rules' `when` may name. */
	conditions?: Readonly<Record<string, Condition>>;
	audience: string;
	issuer?: string;
	now: number;
	/**
	 * Verify as of the token's own `iat`, so `exp` cannot refuse it: a stored
	 * copy outlives its expiry. The caller reports an expired one.
	 */
	ignoreExpiry?: boolean;
	/** What a rules refusal calls the document; default `the pulled rules`. */
	source?: string;
}

export interface Verified {
	ver: number;
	iat: number;
	/** The `schema` claim: the rules format version the publisher wrote. */
	schema?: number;
	/** `exp` in seconds: a required claim. */
	exp: number;
	expired: boolean;
	/** The rules in canonical JSON, to tell a re-signing from other rules. */
	fingerprint: string;
	policy: CompiledPolicy;
}

function mapJoseError(error: unknown): RemotePolicyError {
	const message = error instanceof Error ? error.message : String(error);
	// A key set fetch refused by the pull's own limits keeps its typed code.
	if (error instanceof RemotePolicyError) return error;
	if (
		error instanceof errors.JWTExpired ||
		error instanceof errors.JWTClaimValidationFailed
	) {
		return new RemotePolicyError('CLAIMS', message, { cause: error });
	}
	// Only a refusal of the token itself is SIGNATURE. A malformed or
	// ambiguous key set, a timeout or anything else is not the token's fault.
	if (
		error instanceof errors.JWSSignatureVerificationFailed ||
		error instanceof errors.JWKSNoMatchingKey ||
		error instanceof errors.JWSInvalid ||
		error instanceof errors.JWTInvalid ||
		error instanceof errors.JOSEAlgNotAllowed
	) {
		return new RemotePolicyError('SIGNATURE', message, { cause: error });
	}
	return new RemotePolicyError('FETCH_FAILED', message, { cause: error });
}

/**
 * `jwtVerify`, trying each candidate key when the token has no `kid` and
 * several keys fit (normal while a key rotates): SIGNATURE when none verifies.
 */
async function verifyAgainst(
	jws: string,
	getKey: JWTVerifyGetKey,
	verifyOptions: JWTVerifyOptions,
) {
	try {
		return await jwtVerify(jws, getKey, verifyOptions);
	} catch (error) {
		if (!(error instanceof errors.JWKSMultipleMatchingKeys)) throw error;
		for await (const key of error) {
			try {
				return await jwtVerify(jws, key, verifyOptions);
			} catch (candidate) {
				if (candidate instanceof errors.JWSSignatureVerificationFailed)
					continue;
				throw candidate;
			}
		}
		throw new errors.JWSSignatureVerificationFailed();
	}
}

/** JSON with sorted keys, so equal rules give equal text. */
function canonical(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
	if (typeof value === 'object' && value !== null) {
		const entries = Object.entries(value as Record<string, unknown>)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
		return `{${entries.join(',')}}`;
	}
	return JSON.stringify(value) ?? 'null';
}

function claims(payload: JWTPayload): {
	ver: number;
	iat: number;
	rules: object;
} {
	const { ver, iat, rules } = payload;
	if (typeof ver !== 'number' || !Number.isInteger(ver) || ver < 1) {
		throw new RemotePolicyError('CLAIMS', '`ver` must be a positive integer');
	}
	if (typeof iat !== 'number') {
		throw new RemotePolicyError('CLAIMS', '`iat` is required');
	}
	if (typeof rules !== 'object' || rules === null) {
		throw new RemotePolicyError('CLAIMS', '`rules` must be an object');
	}
	return { ver, iat, rules };
}

/** The optional `schema` claim: absent, or the format version this build reads. */
function checkSchema(schema: unknown): number | undefined {
	if (schema === undefined) return undefined;
	if (schema !== LIMIX_FORMAT_VERSION) {
		throw new RemotePolicyError(
			'CLAIMS',
			`\`schema\` is ${JSON.stringify(schema)}, this build reads the rules format ${LIMIX_FORMAT_VERSION}`,
		);
	}
	return schema;
}

const DEFAULT_SOURCE = 'the pulled rules';

/** Verifies a compact JWS and compiles its rules. */
export async function verifyPolicyToken(
	jws: string,
	getKey: JWTVerifyGetKey,
	options: VerifyOptions,
): Promise<Verified> {
	let asOf = options.now;
	if (options.ignoreExpiry) {
		try {
			const { iat, nbf } = decodeJwt(jws);
			if (nbf !== undefined && nbf * 1000 > options.now) {
				throw new RemotePolicyError('CLAIMS', '"nbf" claim is in the future');
			}
			asOf = Math.max(iat ?? 0, nbf ?? 0) * 1000;
		} catch (error) {
			throw error instanceof RemotePolicyError ? error : mapJoseError(error);
		}
	}
	let payload: JWTPayload;
	try {
		({ payload } = await verifyAgainst(jws, getKey, {
			algorithms: [...ALGORITHMS],
			typ: options.typ,
			audience: options.audience,
			...(options.issuer ? { issuer: options.issuer } : {}),
			requiredClaims: ['iat', 'exp'],
			currentDate: new Date(asOf),
		}));
	} catch (error) {
		throw mapJoseError(error);
	}
	const { ver, iat, rules } = claims(payload);
	const { exp } = payload;
	if (typeof exp !== 'number') {
		throw new RemotePolicyError('CLAIMS', '`exp` is required');
	}
	const schema = checkSchema(payload['schema']);
	const SOURCE = options.source ?? DEFAULT_SOURCE;
	let policy: CompiledPolicy;
	try {
		policy = compilePolicy(parseRules(rules, SOURCE), {
			...(options.conditions ? { conditions: options.conditions } : {}),
		});
	} catch (error) {
		if (!(error instanceof RulesError)) throw error;
		// compilePolicy's refusal names no source; say it came from the pull.
		const message = error.message.startsWith(`Invalid rules in ${SOURCE}`)
			? error.message
			: error.message.replace(/^Invalid rules/, `Invalid rules in ${SOURCE}`);
		throw new RemotePolicyError('RULES_REFUSED', message, { cause: error });
	}
	return {
		ver,
		iat,
		policy,
		fingerprint: canonical(rules),
		exp,
		expired: exp * 1000 <= options.now,
		...(schema !== undefined ? { schema } : {}),
	};
}
