import { describe, expect, it } from 'bun:test';
import { policyOf, recordingChecker, user } from './evaluation.fixtures';
import { explain } from './explain';
import { evaluateField } from './field';
import { evaluateRest } from './rest';

const policy = policyOf(
	{
		global: { unmatched: 'deny' },
		rest: {
			'/notes/:id': {
				PUT: {
					roles: [['editor']],
					when: ['open'],
					relations: [{ require: [[{ relation: 'edit', type: 'note' }]] }],
				},
			},
		},
		graphql: {
			Mutation: { archive: { roles: [['admin']] } },
		},
	},
	{ open: () => true },
);

const call = {
	method: 'PUT',
	path: '/notes/n1',
	claims: user({ roles: ['editor'] }),
} as const;

describe('explain', () => {
	it('lists every step of an allow', async () => {
		const { checker } = recordingChecker();
		const result = await explain(policy, { ...call, relations: checker });
		expect(result.decision.allow).toBe(true);
		expect(result.steps.map((step) => [step.kind, step.passed])).toEqual([
			['match', true],
			['floor', true],
			['roles', true],
			['when', true],
			['relations', true],
		]);
		expect(result.steps[0]?.label).toBe('PUT /notes/:id');
		expect(result.steps[2]?.terms).toEqual([
			{ label: 'editor', passed: true, alternative: 0 },
		]);
		expect(result.steps[3]?.terms?.[0]?.label).toBe('open');
		expect(result.steps[4]?.rung).toBe(0);
		expect(result.steps[4]?.terms?.[0]?.label).toBe(
			'edit on note from param.id',
		);
	});

	it('names the rung that refused and stops there', async () => {
		const { checker } = recordingChecker(() => false);
		const result = await explain(policy, { ...call, relations: checker });
		if (result.decision.allow) throw new Error('expected a refusal');
		expect(result.decision.refusal.status).toBe(404);
		const last = result.steps.at(-1);
		expect(last?.kind).toBe('relations');
		expect(last?.passed).toBe(false);
		expect(last?.rung).toBe(0);
		expect(last?.terms?.[0]?.passed).toBe(false);
	});

	it('stops at the first failing local step and records why', async () => {
		const result = await explain(policy, {
			...call,
			claims: user({ roles: ['reader'] }),
		});
		expect(result.steps.map((step) => step.kind)).toEqual([
			'match',
			'floor',
			'roles',
		]);
		expect(result.steps[2]?.terms?.[0]?.passed).toBe(false);
	});

	it('records a throwing condition', async () => {
		const boom = policyOf(
			{
				global: { unmatched: 'deny' },
				rest: { '/a': { GET: { when: ['boom'] } } },
			},
			{
				boom: () => {
					throw new Error('nope');
				},
			},
		);
		const result = await explain(boom, {
			method: 'GET',
			path: '/a',
			claims: user(),
		});
		expect(result.steps.at(-1)?.terms?.[0]?.note).toBe('threw: nope');
	});

	it('explains an unmatched request and a field', async () => {
		const unmatched = await explain(policy, {
			method: 'GET',
			path: '/ghost',
			claims: user(),
		});
		expect(unmatched.steps).toHaveLength(1);
		expect(unmatched.steps[0]?.kind).toBe('unmatched');
		const field = await explain(policy, {
			type: 'Mutation',
			field: 'archive',
			claims: user({ roles: ['admin'] }),
		});
		expect(field.decision.allow).toBe(true);
		expect(field.steps[0]?.label).toBe('Mutation.archive');
	});

	it('explains an empty source as one failed source step', async () => {
		const { mutableSource } = await import('../source');
		const result = await explain(mutableSource(), call);
		expect(result.steps).toEqual([
			{
				kind: 'source',
				label: 'the policy source holds no policy',
				passed: false,
			},
		]);
	});
});

describe('explain shares the code path of the evaluators', () => {
	it('gives the decision the evaluators give, on allow and on each refusal', async () => {
		const answers = [() => true, () => false];
		const claimsList = [
			user({ roles: ['editor'] }),
			user({ roles: ['editor'] }),
			user(),
			{ authenticated: false } as const,
		];
		for (const [index, claims] of claimsList.entries()) {
			const { checker } = recordingChecker(answers[index % 2]);
			const input = { ...call, claims, relations: checker };
			const explained = await explain(policy, input);
			const decided = await evaluateRest(policy, input);
			expect(explained.decision.allow).toBe(decided.allow);
			if (!explained.decision.allow && !decided.allow) {
				expect(explained.decision.refusal.code).toBe(decided.refusal.code);
			}
		}
		const field = { type: 'Mutation', field: 'archive', claims: user() };
		expect((await explain(policy, field)).decision.allow).toBe(
			(await evaluateField(policy, field)).allow,
		);
	});
});
