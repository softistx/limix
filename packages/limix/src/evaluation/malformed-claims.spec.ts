import { describe, expect, it } from 'bun:test';
import { policyOf, user } from './evaluation.fixtures';
import { evaluateRest } from './rest';

const policy = policyOf({
	global: { unmatched: 'deny' },
	rest: {
		'/roles': { GET: { roles: [['admin']] } },
		'/perms': { GET: { permissions: [['docs:write']] } },
	},
});

const reach = (path: string, claims: ReturnType<typeof user>) =>
	evaluateRest(policy, { method: 'GET', path, claims });

// A credential decoded from the wire can carry any JSON: cast what the types forbid.
const loose = (extra: Record<string, unknown>) => user(extra as never);

describe('malformed claims fail closed', () => {
	it('holds no role for a `roles` that is a string', async () => {
		expect((await reach('/roles', loose({ roles: 'admin' }))).allow).toBe(
			false,
		);
	});

	it('keeps only the strings of a `roles` list', async () => {
		const claims = loose({ roles: [1, null, 'admin'] });
		expect((await reach('/roles', claims)).allow).toBe(true);
	});

	it('holds nothing for `permissions` that is a string', async () => {
		const claims = loose({ scope: 'docs:write', permissions: 'docs:write' });
		expect((await reach('/perms', claims)).allow).toBe(false);
	});

	it('holds nothing for `permissions` that is the empty string', async () => {
		const claims = loose({ scope: 'docs:write', permissions: '' });
		expect((await reach('/perms', claims)).allow).toBe(false);
	});

	it('holds no permission when `scope` is not a string', async () => {
		for (const scope of [['docs:write'], 42, { 'docs:write': true }]) {
			const claims = loose({ scope, permissions: ['docs:write'] });
			expect((await reach('/perms', claims)).allow).toBe(false);
		}
	});

	it('answers an unnamed route 401, not 403, when `authenticated` is not true', async () => {
		for (const authenticated of ['yes', 1, 'false']) {
			const claims = { authenticated } as never;
			const decision = await evaluateRest(policy, {
				method: 'GET',
				path: '/nothing',
				claims,
			});
			if (decision.allow) throw new Error('expected a refusal');
			expect(decision.refusal.status).toBe(401);
		}
	});

	it('requires the route or the path at the type level', () => {
		// @ts-expect-error neither `route` nor `path`
		const input: Parameters<typeof evaluateRest>[1] = {
			method: 'GET',
			claims: user(),
		};
		expect(input.method).toBe('GET');
	});
});
