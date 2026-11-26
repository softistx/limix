import { PublishError } from './errors';
import type { JSONWebKeySet } from './jose';
import { cannotVerify, hasPrivateMembers } from './keys';

/** What `rulesEndpoint` serves and who may read it. */
export interface RulesEndpointOptions {
	/** The signed token (`signRules`), or a function returning the current one. */
	token: string | (() => string | Promise<string>);
	/** Decides per request; false answers 401. Omit it for a public endpoint. */
	authorize?: (request: Request) => boolean | Promise<boolean>;
}

const METHODS = 'GET, HEAD';

function notAllowed(): Response {
	return new Response(null, { status: 405, headers: { allow: METHODS } });
}

/** The strong ETag of a token: base64url SHA-256 of its text, quoted. */
async function etagOf(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		'SHA-256',
		new TextEncoder().encode(token),
	);
	const text = btoa(String.fromCharCode(...new Uint8Array(digest)))
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');
	return `"${text}"`;
}

const opaque = (tag: string) => tag.replace(/^W\//, '');

/** RFC 9110 weak comparison of `If-None-Match` against the current ETag. */
function matches(header: string, etag: string): boolean {
	const value = header.trim();
	if (value === '*') return true;
	return value
		.split(',')
		.map((tag) => tag.trim())
		.some((tag) => tag !== '' && opaque(tag) === opaque(etag));
}

/**
 * A fetch-style handler that serves the token `remotePolicy` pulls: GET and
 * HEAD only, `content-type: application/jwt`, a strong `etag` and
 * `cache-control: no-cache`, 304 on a matching `If-None-Match`. Framework-free:
 * give it a `Request`, send back the `Response`. A refused caller gets 401, a
 * token function that throws 503, an `authorize` that throws 500; the message
 * of either is never sent. Never redirects.
 */
export function rulesEndpoint(
	options: RulesEndpointOptions,
): (request: Request) => Promise<Response> {
	const { token, authorize } = options;
	if (
		(typeof token !== 'string' && typeof token !== 'function') ||
		token === ''
	) {
		throw new PublishError(
			'OPTIONS',
			'`token` must be a non-empty string or a function returning one',
		);
	}
	const cacheControl = authorize ? 'private, no-cache' : 'no-cache';
	return async (request) => {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return notAllowed();
		}
		if (authorize) {
			let allowed: boolean;
			try {
				allowed = await authorize(request);
			} catch {
				return new Response(null, { status: 500 });
			}
			if (!allowed) {
				return new Response(null, {
					status: 401,
					headers: { 'www-authenticate': 'Bearer' },
				});
			}
		}
		let jws: string;
		try {
			jws = typeof token === 'function' ? await token() : token;
			if (typeof jws !== 'string' || jws === '') throw new Error('empty');
		} catch {
			return new Response(null, {
				status: 503,
				headers: { 'cache-control': 'no-store', 'retry-after': '30' },
			});
		}
		const etag = await etagOf(jws);
		const headers = { etag, 'cache-control': cacheControl };
		const condition = request.headers.get('if-none-match');
		if (condition !== null && matches(condition, etag)) {
			return new Response(null, { status: 304, headers });
		}
		return new Response(request.method === 'HEAD' ? null : jws, {
			status: 200,
			headers: { ...headers, 'content-type': 'application/jwt' },
		});
	};
}

/** What `jwksEndpoint` sets. */
export interface JwksEndpointOptions {
	/** `cache-control: max-age`, in seconds; default 300. */
	maxAge?: number;
}

/**
 * A fetch-style handler for the key set (`jwksOf`), the `jwksUri` readers
 * fetch: GET and HEAD, `content-type: application/json`,
 * `cache-control: public, max-age=300`. Refuses at setup a set with a private
 * member, an empty set or an `oct` key.
 */
export function jwksEndpoint(
	jwks: JSONWebKeySet,
	options: JwksEndpointOptions = {},
): (request: Request) => Response {
	const maxAge = options.maxAge ?? 300;
	if (!Number.isInteger(maxAge) || maxAge < 0) {
		throw new PublishError(
			'OPTIONS',
			'`maxAge` must be a non-negative integer (seconds)',
		);
	}
	if (!Array.isArray(jwks?.keys) || jwks.keys.length === 0) {
		throw new PublishError('OPTIONS', 'the key set holds no key');
	}
	for (const jwk of jwks.keys) {
		if (typeof jwk !== 'object' || jwk === null) {
			throw new PublishError(
				'KEY',
				'the key set holds an entry that is not a JWK object',
			);
		}
		if (cannotVerify(jwk)) {
			throw new PublishError(
				'KEY',
				`the key set holds a key that cannot verify${jwk.kid ? ` (kid "${jwk.kid}")` : ''}: its key_ops lack "verify"; build the set with jwksOf`,
			);
		}
		if (jwk.kty === 'oct' || hasPrivateMembers(jwk)) {
			throw new PublishError(
				'KEY',
				`the key set holds private material${jwk.kid ? ` (kid "${jwk.kid}")` : ''}: build it with jwksOf, which keeps the public part only`,
			);
		}
	}
	const body = JSON.stringify(jwks);
	return (request) => {
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			return notAllowed();
		}
		return new Response(request.method === 'HEAD' ? null : body, {
			headers: {
				'content-type': 'application/json',
				'cache-control': `public, max-age=${maxAge}`,
			},
		});
	};
}
