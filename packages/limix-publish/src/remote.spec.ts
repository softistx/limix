import { afterEach, describe, expect, it } from 'bun:test';
import { createHash, timingSafeEqual } from 'node:crypto';
import { evaluateRest } from '@softistx/limix';
import { remotePolicy } from '@softistx/limix/remote';
import {
	jwksEndpoint,
	jwksOf,
	type RulesEndpointOptions,
	rulesEndpoint,
	signRules,
} from './index';
import { pairFor, RULES, T0 } from './keys.fixtures';

const RULES_URL = 'https://pub.test/rules';
const JWKS_URL = 'https://pub.test/jwks';

/** Compares secrets in constant time, whatever their lengths. */
const sameSecret = (given: string | null, secret: string) => {
	const digest = (text: string) => createHash('sha256').update(text).digest();
	return timingSafeEqual(digest(given ?? ''), digest(secret));
};

const stoppers: (() => void)[] = [];
afterEach(() => {
	for (const stop of stoppers.splice(0)) stop();
});

/** A publisher served through a fake `fetch`, which records each rules answer. */
async function publisher() {
	const { privateKey, publicKey } = await pairFor('ES256');
	const sign = (ver: number, rules: unknown = RULES) =>
		signRules(rules, {
			key: privateKey,
			alg: 'ES256',
			kid: 'k1',
			audience: 'svc',
			issuer: 'https://pub.test',
			ver,
			now: () => T0,
		});
	const state = { token: await sign(1), statuses: [] as number[], auth: '' };
	const options: RulesEndpointOptions = {
		token: () => state.token,
		authorize: (request) =>
			sameSecret(request.headers.get('authorization'), 'Bearer s3cret'),
	};
	const rules = rulesEndpoint(options);
	const jwks = jwksEndpoint(
		await jwksOf([{ key: publicKey, kid: 'k1', alg: 'ES256' }]),
	);
	const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = new Request(String(input), init);
		if (request.url === RULES_URL) {
			const response = await rules(request);
			state.statuses.push(response.status);
			return response;
		}
		if (request.url === JWKS_URL) return jwks(request);
		return new Response(null, { status: 404 });
	}) as typeof fetch;
	return { state, sign, fetch: fetchImpl };
}

const pull = (fetchImpl: typeof fetch) => {
	const errors: string[] = [];
	const policy = remotePolicy({
		rulesUrl: RULES_URL,
		jwksUri: JWKS_URL,
		issuer: 'https://pub.test',
		audience: 'svc',
		authToken: 's3cret',
		intervalMs: 3_600_000,
		fetch: fetchImpl,
		now: () => T0,
		onError: (error) => errors.push(`${error.code}: ${error.message}`),
	});
	stoppers.push(() => policy.stop());
	return { policy, errors };
};

const ask = (policy: ReturnType<typeof pull>['policy'], path: string) =>
	evaluateRest(policy, {
		method: 'GET',
		path,
		claims: { authenticated: true, roles: ['user'] },
	});

describe('signRules and the endpoints, pulled by remotePolicy', () => {
	it('serves rules a reader verifies and enforces', async () => {
		const pub = await publisher();
		const { policy, errors } = pull(pub.fetch);
		await policy.ready;
		expect(errors).toEqual([]);
		expect(policy.version()).toBe(1);
		expect((await ask(policy, '/open')).allow).toBe(true);
		expect((await ask(policy, '/billing')).allow).toBe(false);
		expect((await ask(policy, '/elsewhere')).allow).toBe(false);
	});

	it('picks up a re-signing at a higher ver on refresh()', async () => {
		const pub = await publisher();
		const { policy, errors } = pull(pub.fetch);
		await policy.ready;
		pub.state.token = await pub.sign(2, {
			...RULES,
			rest: { '/billing': { GET: { authenticated: true } } },
		});
		expect((await policy.refresh()).changed).toBe(true);
		expect(policy.version()).toBe(2);
		expect((await ask(policy, '/billing')).allow).toBe(true);
		expect((await ask(policy, '/open')).allow).toBe(false);
		expect(errors).toEqual([]);
	});

	it('gets a 304 when the token is unchanged', async () => {
		const pub = await publisher();
		const { policy } = pull(pub.fetch);
		await policy.ready;
		await policy.refresh(); // settles the first pull, like the core's specs
		pub.state.statuses.length = 0;
		expect((await policy.refresh()).changed).toBe(false);
		expect(pub.state.statuses).toEqual([304]);
		expect(policy.version()).toBe(1);
	});

	it('is refused by the endpoint without the bearer token', async () => {
		const pub = await publisher();
		const errors: string[] = [];
		const policy = remotePolicy({
			rulesUrl: RULES_URL,
			jwksUri: JWKS_URL,
			audience: 'svc',
			fetch: pub.fetch,
			now: () => T0,
			onError: (error) => errors.push(error.code),
		});
		stoppers.push(() => policy.stop());
		await policy.refresh();
		expect(errors).toContain('HTTP_STATUS');
		expect(policy.version()).toBeNull();
	});
});
