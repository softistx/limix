import { describe, expect, it } from 'bun:test';
import { jwksEndpoint, jwksOf, PublishError, rulesEndpoint } from './index';
import { pairFor } from './keys.fixtures';

const TOKEN = 'aaa.bbb.ccc';
const url = 'https://pub.test/rules';
const get = (headers: Record<string, string> = {}, method = 'GET') =>
	new Request(url, { method, headers });

describe('rulesEndpoint', () => {
	it('serves the token with its headers', async () => {
		const response = await rulesEndpoint({ token: TOKEN })(get());
		expect(response.status).toBe(200);
		expect(await response.text()).toBe(TOKEN);
		expect(response.headers.get('content-type')).toBe('application/jwt');
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('etag')).toMatch(/^"[A-Za-z0-9_-]{43}"$/);
	});

	it('gives equal tokens equal ETags and other tokens other ones', async () => {
		const etag = async (token: string) =>
			(await rulesEndpoint({ token })(get())).headers.get('etag');
		expect(await etag(TOKEN)).toBe(await etag(TOKEN));
		expect(await etag(TOKEN)).not.toBe(await etag('x.y.z'));
	});

	it('answers HEAD with the headers and no body', async () => {
		const response = await rulesEndpoint({ token: TOKEN })(get({}, 'HEAD'));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
		expect(response.headers.get('content-type')).toBe('application/jwt');
		expect(response.headers.get('etag')).not.toBeNull();
	});

	it('answers any other method 405 with allow', async () => {
		for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
			const response = await rulesEndpoint({ token: TOKEN })(
				new Request(url, { method, body: 'x' }),
			);
			expect(response.status).toBe(405);
			expect(response.headers.get('allow')).toBe('GET, HEAD');
		}
	});

	describe('If-None-Match', () => {
		const handler = rulesEndpoint({ token: TOKEN });
		const etagOf = async () => (await handler(get())).headers.get('etag') ?? '';

		it('answers 304 with the etag and no body on a match', async () => {
			const etag = await etagOf();
			const response = await handler(get({ 'if-none-match': etag }));
			expect(response.status).toBe(304);
			expect(response.headers.get('etag')).toBe(etag);
			expect(await response.text()).toBe('');
		});

		it('matches `*`, a list and a weak tag', async () => {
			const etag = await etagOf();
			for (const header of [
				'*',
				`"other", ${etag}`,
				`"other",${etag} , "third"`,
				`W/${etag}`,
			]) {
				expect((await handler(get({ 'if-none-match': header }))).status).toBe(
					304,
				);
			}
		});

		it('answers 200 for another tag, and for a 304 on HEAD too', async () => {
			expect(
				(await handler(get({ 'if-none-match': '"nope", W/"also"' }))).status,
			).toBe(200);
			expect(
				(await handler(get({ 'if-none-match': await etagOf() }, 'HEAD')))
					.status,
			).toBe(304);
		});
	});

	describe('authorize', () => {
		it('answers 401 with www-authenticate when it says no', async () => {
			const response = await rulesEndpoint({
				token: TOKEN,
				authorize: () => false,
			})(get());
			expect(response.status).toBe(401);
			expect(response.headers.get('www-authenticate')).toBe('Bearer');
			expect(await response.text()).toBe('');
		});

		it('lets the request through when it says yes, awaiting a promise', async () => {
			const seen: string[] = [];
			const handler = rulesEndpoint({
				token: TOKEN,
				authorize: async (request) => {
					seen.push(request.headers.get('authorization') ?? '');
					return request.headers.get('authorization') === 'Bearer s3';
				},
			});
			expect((await handler(get())).status).toBe(401);
			expect((await handler(get({ authorization: 'Bearer s3' }))).status).toBe(
				200,
			);
			expect(seen).toEqual(['', 'Bearer s3']);
		});

		it('answers 500 without the message when it throws', async () => {
			const response = await rulesEndpoint({
				token: TOKEN,
				authorize: () => {
					throw new Error('secret detail');
				},
			})(get());
			expect(response.status).toBe(500);
			expect(await response.text()).not.toContain('secret');
		});

		it('checks the method before authorizing', async () => {
			let called = 0;
			const response = await rulesEndpoint({
				token: TOKEN,
				authorize: () => {
					called++;
					return true;
				},
			})(new Request(url, { method: 'POST', body: 'x' }));
			expect(response.status).toBe(405);
			expect(called).toBe(0);
		});
	});

	describe('a token function', () => {
		it('is called per request and may be async', async () => {
			let current = 'a.b.c';
			const handler = rulesEndpoint({ token: async () => current });
			const first = await handler(get());
			current = 'd.e.f';
			const second = await handler(get());
			expect(await first.text()).toBe('a.b.c');
			expect(await second.text()).toBe('d.e.f');
			expect(first.headers.get('etag')).not.toBe(second.headers.get('etag'));
		});

		it('answers 503 without the message when it throws or rejects', async () => {
			for (const token of [
				() => {
					throw new Error('vault down');
				},
				async () => {
					throw new Error('vault down');
				},
				() => '',
			]) {
				const response = await rulesEndpoint({ token })(get());
				expect(response.status).toBe(503);
				expect(await response.text()).not.toContain('vault');
			}
		});
	});

	it('refuses a token that is neither a string nor a function, or is empty', () => {
		for (const token of [5, '']) {
			expect(() => rulesEndpoint({ token: token as never })).toThrow(
				PublishError,
			);
		}
	});

	it('says private, no-cache when it authorizes', async () => {
		const open = await rulesEndpoint({ token: TOKEN })(get());
		expect(open.headers.get('cache-control')).toBe('no-cache');
		const handler = rulesEndpoint({ token: TOKEN, authorize: () => true });
		const closed = await handler(get());
		expect(closed.headers.get('cache-control')).toBe('private, no-cache');
		const etag = closed.headers.get('etag') ?? '';
		const cached = await handler(get({ 'if-none-match': etag }));
		expect(cached.headers.get('cache-control')).toBe('private, no-cache');
	});

	it('never answers a redirect', async () => {
		const handler = rulesEndpoint({ token: TOKEN });
		for (const method of ['GET', 'HEAD', 'POST']) {
			const response = await handler(new Request(url, { method }));
			expect(response.status < 300 || response.status >= 400).toBe(true);
			expect(response.headers.get('location')).toBeNull();
		}
	});
});

describe('jwksEndpoint', () => {
	const make = async () => {
		const { publicKey } = await pairFor('ES256');
		return jwksOf([{ key: publicKey, kid: 'k1', alg: 'ES256' }]);
	};

	it('serves the set as JSON with a default max-age of 300', async () => {
		const jwks = await make();
		const response = jwksEndpoint(jwks)(get());
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(response.headers.get('cache-control')).toBe('public, max-age=300');
		expect(await response.json()).toEqual(jwks);
	});

	it('takes a max-age, answers HEAD without a body, refuses other methods', async () => {
		const handler = jwksEndpoint(await make(), { maxAge: 60 });
		const head = handler(get({}, 'HEAD'));
		expect(head.headers.get('cache-control')).toBe('public, max-age=60');
		expect(await head.text()).toBe('');
		const post = handler(new Request(url, { method: 'POST', body: 'x' }));
		expect(post.status).toBe(405);
		expect(post.headers.get('allow')).toBe('GET, HEAD');
	});

	it('refuses at setup a set with private members, an oct key or no key', async () => {
		const jwks = await make();
		const [pub] = jwks.keys;
		expect(() => jwksEndpoint({ keys: [{ ...pub, d: 'x' } as never] })).toThrow(
			PublishError,
		);
		expect(() => jwksEndpoint({ keys: [{ kty: 'oct', k: 'x' }] })).toThrow(
			PublishError,
		);
		expect(() => jwksEndpoint({ keys: [] })).toThrow(PublishError);
		for (const entry of [null, 'k', 5, undefined]) {
			expect(() => jwksEndpoint({ keys: [entry as never] })).toThrow(
				/not a JWK object/,
			);
		}
		for (const key_ops of [['sign'], []]) {
			expect(() => jwksEndpoint({ keys: [{ ...pub, key_ops }] })).toThrow(
				/key_ops/,
			);
		}
		expect(() =>
			jwksEndpoint({ keys: [{ ...pub, key_ops: ['verify'] }] }),
		).not.toThrow();
		expect(() => jwksEndpoint(jwks, { maxAge: -1 })).toThrow(PublishError);
	});
});
