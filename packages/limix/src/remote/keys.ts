import {
	createRemoteJWKSet,
	customFetch,
	type JSONWebKeySet,
	type RemoteJWKSet,
} from 'jose';
import { readCapped } from './body';
import { messageOf, within } from './deadline';
import { RemotePolicyConfigError, RemotePolicyError } from './errors';
import { assertSecure } from './validate';

export interface Keys {
	/**
	 * The resolver for the remote key set; discovers `jwks_uri` first when
	 * needed. `signal` aborts the discovery (the cycle's deadline, or `stop()`).
	 */
	resolver(signal?: AbortSignal): Promise<RemoteJWKSet>;
	/** The key set last fetched, to store beside the token it verified. */
	jwks(): JSONWebKeySet | undefined;
	/**
	 * Forgets a discovered `jwks_uri` after a key miss, so the next `resolver()`
	 * discovers again. False when the URL is configured, not discovered.
	 */
	rediscover(): boolean;
}

export interface KeysOptions {
	/** Skips discovery when given. */
	jwksUri?: string;
	issuer?: string;
	fetch: typeof fetch;
	timeoutMs: number;
}

const trimSlashes = (value: string) => value.replace(/\/+$/, '');

async function fetchDocument(
	url: string,
	options: KeysOptions,
	signal: AbortSignal | undefined,
) {
	const response = await within(
		options.fetch(url, {
			headers: { accept: 'application/json' },
			signal: signal
				? AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs)])
				: AbortSignal.timeout(options.timeoutMs),
		}),
		options.timeoutMs,
		signal,
	);
	if (!response.ok) throw new Error(`${url} answered ${response.status}`);
	const text = await within(
		readCapped(response, url),
		options.timeoutMs,
		signal,
	);
	return JSON.parse(text) as { issuer?: unknown; jwks_uri?: unknown };
}

async function discover(
	issuer: string,
	options: KeysOptions,
	signal: AbortSignal | undefined,
): Promise<string> {
	const url = `${trimSlashes(issuer)}/.well-known/openid-configuration`;
	try {
		const document = await fetchDocument(url, options, signal);
		if (
			typeof document.issuer !== 'string' ||
			trimSlashes(document.issuer) !== trimSlashes(issuer)
		) {
			throw new Error(
				`${url} names issuer ${String(document.issuer)}, not ${issuer}`,
			);
		}
		if (typeof document.jwks_uri !== 'string') {
			throw new Error(`${url} has no jwks_uri`);
		}
		assertSecure('discovered jwks_uri', document.jwks_uri);
		return document.jwks_uri;
	} catch (error) {
		if (error instanceof RemotePolicyError) throw error;
		throw new RemotePolicyError(
			'FETCH_FAILED',
			`discovery failed: ${messageOf(error)}`,
			{ cause: error },
		);
	}
}

async function readWhole(
	pending: Promise<Response>,
	url: string,
): Promise<Response> {
	const response = await pending;
	const text = await readCapped(response, url);
	const headers = new Headers(response.headers);
	headers.delete('content-length');
	headers.delete('content-encoding');
	return new Response(text, { status: response.status, headers });
}

function keySetUri(options: KeysOptions, signal: AbortSignal | undefined) {
	if (options.jwksUri) return options.jwksUri;
	if (!options.issuer) {
		throw new RemotePolicyConfigError(
			'remotePolicy: give `jwksUri`, `issuer`, or both',
		);
	}
	return discover(options.issuer, options, signal);
}

/** Resolves signing keys from `jwksUri`, or from the issuer's discovery document. */
export function createKeys(options: KeysOptions): Keys {
	let set: Promise<RemoteJWKSet> | undefined;
	let current: RemoteJWKSet | undefined;
	return {
		resolver(signal) {
			set ??= (async () => {
				const uri = await keySetUri(options, signal);
				current = createRemoteJWKSet(new URL(uri), {
					timeoutDuration: options.timeoutMs,
					// Raced here too: a fetch that ignores its signal must not hang a pull.
					// The body is read here, capped, inside the same deadline: jose reads
					// `response.json()` outside any timeout and with no size limit.
					[customFetch]: (url, init) =>
						within(
							readWhole(options.fetch(url, init), url),
							options.timeoutMs,
							init?.signal ?? undefined,
						),
				});
				return current;
			})().catch((error) => {
				set = undefined;
				throw error;
			});
			return set;
		},
		jwks: () => current?.jwks(),
		rediscover() {
			if (options.jwksUri) return false;
			set = undefined;
			return true;
		},
	};
}
