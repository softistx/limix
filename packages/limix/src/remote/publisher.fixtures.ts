import {
	exportJWK,
	generateKeyPair,
	type JSONWebKeySet,
	type JWTPayload,
	SignJWT,
} from 'jose';

export const URL_RULES = 'https://pub.test/rules';
export const URL_JWKS = 'https://pub.test/jwks';
export const ISSUER = 'https://pub.test';
export const TYP = 'limix-rules+jwt';
export const AUDIENCE = 'svc';
export const T0 = 1_800_000_000_000;

export const rulesFor = (path: string) => ({
	limix: 1,
	global: { unmatched: 'deny' },
	rest: { [path]: { GET: { public: true } } },
});

export interface SignOptions {
	typ?: string;
	aud?: string;
	iss?: string;
	/** Seconds; `null` leaves it out. Default: an hour after `T0`. */
	exp?: number | null;
	nbf?: number;
	/** Header `kid`; `null` leaves it out. Default `k1`. */
	kid?: string | null;
}

export interface PublisherState {
	body: string;
	etag: string | undefined;
	status: number;
	down: boolean;
	discoveryIssuer: string;
	discoveryJwksUri: string;
	calls: { rules: number; jwks: number; discovery: number };
	auth: (string | null)[];
	conditional: (string | null)[];
	/** Answers 304 whatever the request carried. */
	always304: boolean;
	/** Served instead of the key set when set. */
	jwksOverride: unknown;
	/** Every URL asked of the fake. */
	requested: string[];
}

export interface Signer {
	alg: 'ES256' | 'HS256';
	privateKey: CryptoKey;
	secret: Uint8Array;
}

async function signToken(
	signer: Signer,
	claims: JWTPayload & { ver?: unknown; rules?: unknown },
	options: SignOptions = {},
) {
	const jwt = new SignJWT(claims)
		.setProtectedHeader({
			alg: signer.alg,
			typ: options.typ ?? TYP,
			...(options.kid === null ? {} : { kid: options.kid ?? 'k1' }),
		})
		.setAudience(options.aud ?? AUDIENCE)
		.setIssuer(options.iss ?? ISSUER);
	if (!('iat' in claims)) jwt.setIssuedAt(Math.floor(T0 / 1000));
	if (options.exp !== null) {
		jwt.setExpirationTime(options.exp ?? Math.floor(T0 / 1000) + 3600);
	}
	if (options.nbf) jwt.setNotBefore(options.nbf);
	return jwt.sign(signer.alg === 'HS256' ? signer.secret : signer.privateKey);
}

async function publishRules(
	state: PublisherState,
	signer: Signer,
	ver: number,
	path: string,
	options?: SignOptions,
) {
	state.body = await signToken(
		signer,
		{ ver, rules: rulesFor(path), schema: 1 },
		options,
	);
	state.etag = `"v${ver}"`;
	return state.body;
}

function serveRules(state: PublisherState, headers: Headers) {
	state.calls.rules++;
	state.auth.push(headers.get('authorization'));
	state.conditional.push(headers.get('if-none-match'));
	if (state.down) throw new TypeError('network down');
	if (state.status !== 200) return new Response('', { status: state.status });
	if (
		state.always304 ||
		(state.etag && headers.get('if-none-match') === state.etag)
	) {
		return new Response(null, { status: 304 });
	}
	return new Response(state.body, {
		headers: state.etag ? { etag: state.etag } : {},
	});
}

function makeFetch(state: PublisherState, jwks: JSONWebKeySet): typeof fetch {
	return (async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = String(input);
		state.requested.push(url);
		if (url === URL_JWKS) {
			state.calls.jwks++;
			return Response.json(state.jwksOverride ?? jwks);
		}
		if (url === `${ISSUER}/.well-known/openid-configuration`) {
			state.calls.discovery++;
			return Response.json({
				issuer: state.discoveryIssuer,
				jwks_uri: state.discoveryJwksUri,
			});
		}
		if (url !== URL_RULES) return new Response('', { status: 404 });
		return serveRules(state, new Headers(init?.headers));
	}) as typeof fetch;
}

/** A fake publisher: signs tokens, serves rules, the key set and discovery. */
export async function createPublisher(alg: 'ES256' | 'HS256' = 'ES256') {
	const { publicKey, privateKey } = await generateKeyPair('ES256');
	const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' };
	// In HS256 mode the key set advertises the shared secret as an `oct` key.
	const secret = new TextEncoder().encode('x'.repeat(32));
	const octKey = {
		kty: 'oct',
		k: Buffer.from(secret).toString('base64url'),
		kid: 'k1',
	};
	const jwks: JSONWebKeySet = { keys: [alg === 'HS256' ? octKey : jwk] };
	const signer: Signer = { alg, privateKey, secret };
	const state: PublisherState = {
		body: '',
		etag: undefined,
		status: 200,
		down: false,
		discoveryIssuer: ISSUER,
		discoveryJwksUri: URL_JWKS,
		calls: { rules: 0, jwks: 0, discovery: 0 },
		auth: [],
		conditional: [],
		always304: false,
		jwksOverride: undefined,
		requested: [],
	};
	return {
		sign: (claims: Parameters<typeof signToken>[1], options?: SignOptions) =>
			signToken(signer, claims, options),
		publish: (ver: number, path = '/a', options?: SignOptions) =>
			publishRules(state, signer, ver, path, options),
		state,
		jwks,
		fetch: makeFetch(state, jwks),
	};
}
