import { describe, expect, it } from 'bun:test';
import { anonymous, policyOf, recordingChecker, user } from './fixtures';
import { evaluateRest } from './rest';

const policy = policyOf({
	global: { unmatched: 'deny' },
	rest: {
		'/notes/:id': {
			PUT: {
				relations: [
					{
						require: [
							[
								{ relation: 'view', type: 'note' },
								{ relation: 'edit', type: 'note' },
							],
							[{ relation: 'admin', type: 'note' }],
						],
					},
					{
						require: [[{ relation: 'own', type: 'note' }]],
						onDeny: 'FORBIDDEN',
						message: 'notes.errors.not-owner',
					},
				],
			},
		},
		'/batch': {
			POST: {
				relations: [
					{
						require: [[{ relation: 'edit', type: 'note', from: 'json.ids' }]],
					},
				],
			},
		},
		'/search': {
			GET: {
				relations: [
					{
						require: [
							[{ relation: 'view', type: 'project', from: 'query.project' }],
						],
					},
				],
			},
		},
		'/docs': {
			POST: {
				relations: [
					{
						require: [[{ relation: 'edit', type: 'doc', from: 'json.doc.id' }]],
					},
				],
			},
		},
	},
});

const put = (relations: Parameters<typeof evaluateRest>[1]['relations']) =>
	evaluateRest(policy, {
		method: 'PUT',
		path: '/notes/n1',
		claims: user(),
		relations,
	});

describe('relation rungs', () => {
	it('makes exactly one checker call per rung, with every query of the rung', async () => {
		const { checker, calls } = recordingChecker();
		const decision = await put(checker);
		expect(decision.allow).toBe(true);
		expect(calls).toHaveLength(2);
		expect(calls[0]).toEqual([
			{
				subject: { type: 'user', id: 'u1' },
				relation: 'view',
				object: { type: 'note', id: 'n1' },
			},
			{
				subject: { type: 'user', id: 'u1' },
				relation: 'edit',
				object: { type: 'note', id: 'n1' },
			},
			{
				subject: { type: 'user', id: 'u1' },
				relation: 'admin',
				object: { type: 'note', id: 'n1' },
			},
		]);
		expect(calls[1]).toHaveLength(1);
	});

	it('answers 404 with the default code when the first rung fails, and never asks the second', async () => {
		const { checker, calls } = recordingChecker(() => false);
		const decision = await put(checker);
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.status).toBe(404);
		expect(decision.refusal.code).toBe('errors.not-found');
		expect(calls).toHaveLength(1);
	});

	it('answers a FORBIDDEN rung 403 with its own message as the code', async () => {
		const { checker } = recordingChecker((q) => q.relation !== 'own');
		const decision = await put(checker);
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.status).toBe(403);
		expect(decision.refusal.code).toBe('notes.errors.not-owner');
	});

	it('holds a rung on the second alternative alone', async () => {
		const { checker } = recordingChecker(
			(q) => q.relation === 'admin' || q.relation === 'own',
		);
		expect((await put(checker)).allow).toBe(true);
	});

	it('does not ask the backend when a local check already refused', async () => {
		const { checker, calls } = recordingChecker();
		const decision = await evaluateRest(policy, {
			method: 'PUT',
			path: '/notes/n1',
			claims: anonymous,
			relations: checker,
		});
		expect(decision.allow).toBe(false);
		expect(calls).toHaveLength(0);
	});
});

describe('where the object id is read', () => {
	it('defaults to param.id on REST', async () => {
		const { checker, calls } = recordingChecker();
		await put(checker);
		expect(calls[0]?.[0]?.object.id).toBe('n1');
	});

	it('reads query., json. and a nested json path', async () => {
		const { checker, calls } = recordingChecker();
		await evaluateRest(policy, {
			method: 'GET',
			path: '/search',
			claims: user(),
			request: { query: { project: 'p9' } },
			relations: checker,
		});
		await evaluateRest(policy, {
			method: 'POST',
			path: '/docs',
			claims: user(),
			request: { json: { doc: { id: 'd7' } } },
			relations: checker,
		});
		expect(calls[0]?.[0]?.object).toEqual({ type: 'project', id: 'p9' });
		expect(calls[1]?.[0]?.object).toEqual({ type: 'doc', id: 'd7' });
	});

	it('asks about every element of a list, in the same call', async () => {
		const { checker, calls } = recordingChecker();
		await evaluateRest(policy, {
			method: 'POST',
			path: '/batch',
			claims: user(),
			request: { json: { ids: ['a', 'b'] } },
			relations: checker,
		});
		expect(calls).toHaveLength(1);
		expect(calls[0]?.map((q) => q.object.id)).toEqual(['a', 'b']);
	});

	it('denies a missing id with the rung answer, and does not call the checker', async () => {
		const { checker, calls } = recordingChecker();
		const decision = await evaluateRest(policy, {
			method: 'GET',
			path: '/search',
			claims: user(),
			relations: checker,
		});
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.status).toBe(404);
		expect(calls).toHaveLength(0);
	});

	it('denies when one element of a list is refused', async () => {
		const { checker } = recordingChecker((q) => q.object.id !== 'b');
		const decision = await evaluateRest(policy, {
			method: 'POST',
			path: '/batch',
			claims: user(),
			request: { json: { ids: ['a', 'b'] } },
			relations: checker,
		});
		expect(decision.allow).toBe(false);
	});
});

describe('a rung that cannot be answered', () => {
	it('refuses with limix.errors.unavailable when no checker was supplied', async () => {
		const decision = await put(undefined);
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.code).toBe('limix.errors.unavailable');
		expect(decision.refusal.status).toBe(503);
	});

	it('answers 401 for a signed-in caller without a subject', async () => {
		const { checker } = recordingChecker();
		const decision = await evaluateRest(policy, {
			method: 'PUT',
			path: '/notes/n1',
			claims: { authenticated: true },
			relations: checker,
		});
		if (decision.allow) throw new Error('expected a refusal');
		expect(decision.refusal.status).toBe(401);
	});

	it('throws when the checker answers the wrong number of booleans', async () => {
		await expect(put({ check: async () => [true] })).rejects.toThrow(
			'one boolean per query',
		);
	});

	it('only an answer of true counts', async () => {
		const decision = await put({
			check: async (queries) => queries.map(() => 'yes' as never),
		});
		expect(decision.allow).toBe(false);
	});
});
