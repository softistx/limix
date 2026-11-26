import { readCapped } from './body';
import { messageOf, within } from './deadline';
import { RemotePolicyError } from './errors';

export type Pulled =
	| { notModified: true }
	| { notModified: false; jws: string; etag?: string };

export interface PullOptions {
	url: string;
	token?: string | (() => string | Promise<string>);
	etag?: string;
	fetch: typeof fetch;
	/** Aborts the request: the timeout, or `stop()`. */
	signal: AbortSignal;
	timeoutMs: number;
}

/** One conditional GET of the signed rules. */
export async function pullSigned(options: PullOptions): Promise<Pulled> {
	const headers: Record<string, string> = {
		accept: 'application/jwt, text/plain',
	};
	try {
		const { token: source } = options;
		const token =
			typeof source === 'function'
				? await within(
						Promise.resolve().then(() => source()),
						options.timeoutMs,
						options.signal,
					)
				: source;
		if (token) headers['authorization'] = `Bearer ${token}`;
	} catch (error) {
		throw new RemotePolicyError('FETCH_FAILED', 'the token function threw', {
			cause: error,
		});
	}
	if (options.etag) headers['if-none-match'] = options.etag;
	let response: Response;
	let body = '';
	try {
		const { signal } = options;
		response = await within(
			options.fetch(options.url, { headers, signal }),
			options.timeoutMs,
			signal,
		);
		if (response.status === 200) {
			const text = readCapped(response, options.url);
			body = (await within(text, options.timeoutMs, signal)).trim();
		}
	} catch (error) {
		if (error instanceof RemotePolicyError) throw error;
		throw new RemotePolicyError(
			'FETCH_FAILED',
			`could not reach ${options.url}: ${messageOf(error)}`,
			{ cause: error },
		);
	}
	if (response.status === 304) return { notModified: true };
	if (response.status !== 200) {
		throw new RemotePolicyError(
			'HTTP_STATUS',
			`${options.url} answered ${response.status}`,
		);
	}
	const etag = response.headers.get('etag') ?? undefined;
	return { notModified: false, jws: body, ...(etag ? { etag } : {}) };
}
