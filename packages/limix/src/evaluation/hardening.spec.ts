import { describe, expect, it } from 'bun:test';
import {
	anonymous,
	policyOf,
	recordingChecker,
	user,
} from './evaluation.fixtures';
import { evaluateField } from './field';
import { noPolicy } from './held';
import type { Decision } from './refusal';
import type { RelationChecker } from './relations';
import { evaluateRest } from './rest';

const refusalOf = (decision: Decision) => {
	if (decision.allow) throw new Error('expected a refusal');
	return decision.refusal;
};

const relations = [{ require: [[{ relation: 'view', type: 'doc' }]] }];

describe('info', () => {
	it('reaches a REST condition', async () => {
		const seen: unknown[] = [];
		const policy = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/a': { GET: { when: ['spy'] } } },
			},
			{
				spy: ({ info }) => {
					seen.push(info);
					return true;
				},
			},
		);
		const info = { requestId: 'r1' };
		await evaluateRest(policy, {
			method: 'GET',
			path: '/a',
			claims: user(),
			info,
		});
		expect(seen).toEqual([info]);
	});

	it('reaches a GraphQL condition', async () => {
		const seen: unknown[] = [];
		const policy = policyOf(
			{
				global: { unmatched: 'deny' },
				graphql: { Query: { a: { when: ['spy'] } } },
			},
			{
				spy: ({ info }) => {
					seen.push(info);
					return true;
				},
			},
		);
		const info = { fieldName: 'a' };
		await evaluateField(policy, {
			type: 'Query',
			field: 'a',
			claims: user(),
			info,
		});
		expect(seen).toEqual([info]);
	});
});

describe('a `when` condition', () => {
	it('denies when it returns something truthy that is not true', async () => {
		for (const value of [1, 'yes']) {
			const policy = policyOf(
				{
					global: { unmatched: 'deny' },
					rest: { '/a': { GET: { when: ['loose'] } } },
				},
				{ loose: (() => value) as never },
			);
			const decision = await evaluateRest(policy, {
				method: 'GET',
				path: '/a',
				claims: user(),
			});
			expect(refusalOf(decision).status).toBe(403);
		}
	});
});

describe('a RelationChecker that throws', () => {
	it('propagates the error instead of answering', async () => {
		const policy = policyOf({
			global: { unmatched: 'deny' },
			rest: { '/docs/:id': { GET: { relations } } },
		});
		const checker: RelationChecker = {
			check: async () => {
				throw new Error('janus is down');
			},
		};
		await expect(
			evaluateRest(policy, {
				method: 'GET',
				path: '/docs/1',
				claims: user(),
				relations: checker,
			}),
		).rejects.toThrow('janus is down');
	});
});

describe('HEAD', () => {
	it('is refused by its own rule while GET allows', async () => {
		const policy = policyOf({
			global: { unmatched: 'allow' },
			rest: {
				'/a': { GET: { public: true }, HEAD: { roles: [['admin']] } },
			},
		});
		const call = (method: string) =>
			evaluateRest(policy, { method, path: '/a', claims: user() });
		expect((await call('GET')).allow).toBe(true);
		expect(refusalOf(await call('HEAD')).status).toBe(403);
	});
});

describe('route and path together', () => {
	const policy = policyOf({
		global: { unmatched: 'allow' },
		rest: { '/docs/:id': { GET: { roles: [['admin']] } } },
	});

	it('matches `path` when `route` is not spelled as in the rules file', async () => {
		const decision = await evaluateRest(policy, {
			method: 'GET',
			route: '/docs/{id}',
			path: '/docs/1',
			claims: user(),
		});
		expect(refusalOf(decision).status).toBe(403);
	});

	it('is unmatched, and open, when neither matches', async () => {
		const decision = await evaluateRest(policy, {
			method: 'GET',
			route: '/other/{id}',
			path: '/other/1',
			claims: user(),
		});
		expect(decision.allow).toBe(true);
	});
});

describe('GraphQL roots', () => {
	const policy = policyOf({
		global: { unmatched: 'deny' },
		graphql: { Query: { a: { public: true } } },
	});

	it('applies `unmatched` to a renamed root when `root` says so', async () => {
		const call = (root?: boolean) =>
			evaluateField(policy, {
				type: 'RootQuery',
				field: 'b',
				claims: user(),
				...(root === undefined ? {} : { root }),
			});
		expect(refusalOf(await call(true)).status).toBe(403);
		expect((await call()).allow).toBe(true);
	});

	it('treats a type named Query as a root by default', async () => {
		const decision = await evaluateField(policy, {
			type: 'Query',
			field: 'b',
			claims: user(),
		});
		expect(refusalOf(decision).status).toBe(403);
	});
});

describe('a caller with no subject on a relations rule', () => {
	const policy = policyOf({
		global: { unmatched: 'deny' },
		rest: { '/docs/:id': { GET: { relations } } },
	});

	it('never asks the checker about a malformed subject', async () => {
		for (const subject of [
			'u1',
			{ type: 'user' },
			{ type: '', id: 'u1' },
			{ type: 'user', id: 7 },
		]) {
			const { checker, calls } = recordingChecker();
			const decision = await evaluateRest(policy, {
				method: 'GET',
				path: '/docs/1',
				claims: { authenticated: true, subject: subject as never },
				relations: checker,
			});
			expect(refusalOf(decision).params).toEqual({ reason: 'no-subject' });
			expect(calls).toHaveLength(0);
		}
	});

	it('is forbidden, with the reason', async () => {
		const { checker, calls } = recordingChecker();
		const decision = await evaluateRest(policy, {
			method: 'GET',
			path: '/docs/1',
			claims: { authenticated: true },
			relations: checker,
		});
		const refusal = refusalOf(decision);
		expect(refusal.status).toBe(403);
		expect(refusal.code).toBe('auth.errors.forbidden');
		expect(refusal.params).toEqual({ reason: 'no-subject' });
		expect(calls).toHaveLength(0);
	});

	it('stays 401 when anonymous', async () => {
		const decision = await evaluateRest(policy, {
			method: 'GET',
			path: '/docs/1',
			claims: anonymous,
			relations: recordingChecker().checker,
		});
		expect(refusalOf(decision).status).toBe(401);
	});
});

describe('noPolicy', () => {
	it('builds a fresh explanation and refusal on every call', () => {
		const first = noPolicy();
		first.steps.push({ kind: 'source', label: 'mutated', passed: true });
		if (first.decision.allow) throw new Error('expected a refusal');
		(first.decision.refusal.params as Record<string, unknown>)['reason'] =
			'changed';
		const next = noPolicy();
		expect(next.steps).toHaveLength(1);
		expect(refusalOf(next.decision).params).toEqual({ reason: 'no-policy' });
		expect(next.decision).not.toBe(first.decision);
	});
});
