import {
	type CompiledPolicy,
	type Condition,
	compilePolicy,
	LIMIX_FORMAT_VERSION,
	parseRules,
} from '@softistx/limix';
import { DEFAULT_TYP } from '@softistx/limix/remote';
import { PublishError } from './errors';
import { signCompact } from './jose';
import { type Alg, assertAlg, assertKid, assertSigningKey } from './keys';

/** The default lifetime of a token, in seconds: one day. */
const DEFAULT_EXPIRES_IN = 86_400;

/** What `signRules` signs with. */
export interface SignRulesOptions {
	/** The private key, as a `CryptoKey` (`importPKCS8`, `generateKeyPair`). */
	key: CryptoKey;
	/** One of RS256, PS256, ES256, EdDSA; the key must fit it. */
	alg: Alg;
	/** The key's id in the key set (`jwksOf`); readers pick the key by it. */
	kid: string;
	/** The reader's `audience`. */
	audience: string | string[];
	issuer?: string;
	/** The version readers compare: a positive integer that only goes up. */
	ver: number;
	/** Lifetime in seconds, a positive integer; default 86400. */
	expiresIn?: number;
	/** Milliseconds since the epoch; default `Date.now`. */
	now?: () => number;
	/** The `typ` header; default `limix-rules+jwt`, which readers require. */
	typ?: string;
	/**
	 * The predicates a rule's `when` may name, as a list of names or as the
	 * predicate map a reader registers (its keys are used, so a host can pass
	 * one object to both). When given, a rule naming another is refused; when
	 * absent only the structure is checked.
	 */
	conditions?: readonly string[] | Readonly<Record<string, Condition>>;
}

const accept: Condition = () => true;

/** Every name a `when` list holds, anywhere in the document. */
function conditionNames(value: unknown, into = new Set<string>()): Set<string> {
	if (Array.isArray(value)) {
		for (const item of value) conditionNames(item, into);
	} else if (typeof value === 'object' && value !== null) {
		for (const [key, item] of Object.entries(value)) {
			if (key === 'when' && Array.isArray(item)) {
				for (const name of item) if (typeof name === 'string') into.add(name);
			} else {
				conditionNames(item, into);
			}
		}
	}
	return into;
}

function stubs(names: Iterable<string>): Record<string, Condition> {
	return Object.fromEntries([...names].map((name) => [name, accept]));
}

/**
 * Validates `rules` the way a reader will (`parseRules` then `compilePolicy`)
 * and returns the parsed document with its compiled form. Throws the core's
 * `RulesError`.
 */
function validate(rules: unknown, conditions: SignRulesOptions['conditions']) {
	const parsed = parseRules(rules, 'the rules to sign');
	const names =
		conditions === undefined
			? conditionNames(parsed)
			: Array.isArray(conditions)
				? conditions
				: Object.keys(conditions);
	const policy: CompiledPolicy = compilePolicy(parsed, {
		conditions: stubs(names),
	});
	return { parsed, policy };
}

function positiveInteger(name: string, value: unknown): number {
	if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
		throw new PublishError(
			'OPTIONS',
			`\`${name}\` must be a positive integer, got ${String(value)}`,
		);
	}
	return value;
}

function assertAudience(audience: unknown): void {
	const list = Array.isArray(audience) ? audience : [audience];
	if (
		list.length === 0 ||
		list.some((item) => typeof item !== 'string' || item === '')
	) {
		throw new PublishError(
			'OPTIONS',
			'`audience` must be a non-empty string or a list of them',
		);
	}
}

/**
 * Signs a rules document as the compact JWS `remotePolicy` pulls: header
 * `{ alg, typ, kid }`, claims `ver`, `rules`, `schema`, `iat`, `exp`, `aud`
 * and `iss`. The rules are validated first, as a reader will. Throws
 * `RulesError` for rules a reader would refuse and `PublishError` (`KEY` or
 * `OPTIONS`) for a key or an option it will not sign with.
 */
export async function signRules(
	rules: unknown,
	options: SignRulesOptions,
): Promise<string> {
	assertAlg(options.alg);
	assertKid(options.kid);
	const ver = positiveInteger('ver', options.ver);
	const expiresIn = positiveInteger(
		'expiresIn',
		options.expiresIn ?? DEFAULT_EXPIRES_IN,
	);
	assertAudience(options.audience);
	if (options.issuer !== undefined && options.issuer === '') {
		throw new PublishError('OPTIONS', '`issuer` must not be empty');
	}
	const typ = options.typ ?? DEFAULT_TYP;
	if (typ === '') throw new PublishError('OPTIONS', '`typ` must not be empty');
	const key = assertSigningKey(options.key, options.alg);
	const { parsed } = validate(rules, options.conditions);
	const iat = Math.floor((options.now ?? Date.now)() / 1000);
	return signCompact(
		{
			ver,
			rules: parsed,
			schema: LIMIX_FORMAT_VERSION,
			iat,
			exp: iat + expiresIn,
			aud: options.audience,
			...(options.issuer ? { iss: options.issuer } : {}),
		},
		{ alg: options.alg, typ, kid: options.kid },
		key,
	);
}
