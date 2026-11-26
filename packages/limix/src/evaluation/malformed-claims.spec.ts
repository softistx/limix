import { describe, expect, it } from 'bun:test';
import { policyOf, user } from './evaluation.fixtures';
import { explain } from './explain';
import { evaluateField } from './field';
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

describe('missing claims', () => {
	const gate = policyOf({
		global: { unmatched: 'deny' },
		rest: { '/a': { GET: { public: true } } },
		graphql: { Query: { a: { public: true } } },
	});
	const none = [undefined, null, 'x', 3] as never[];

	it('throws a clear TypeError, not a raw one', async () => {
		for (const claims of none) {
			await expect(
				evaluateRest(gate, { method: 'GET', route: '/a', claims }),
			).rejects.toThrow('evaluateRest: pass the `claims`');
			await expect(
				explain(gate, { method: 'GET', route: '/a', claims }),
			).rejects.toThrow('evaluateRest: pass the `claims`');
			await expect(
				evaluateField(gate, { type: 'Query', field: 'a', claims }),
			).rejects.toThrow('evaluateField: pass the `claims`');
			await expect(
				explain(gate, { type: 'Query', field: 'a', claims }),
			).rejects.toThrow('evaluateField: pass the `claims`');
		}
	});
});
