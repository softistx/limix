import { describe, expect, it } from 'bun:test';
import { evaluateField } from './field';
import { anonymous, policyOf, recordingChecker, user } from './fixtures';
import type { Decision } from './refusal';

const policy = policyOf(
	{
		global: { unmatched: 'deny' },
		graphql: {
			Query: {
				me: { authenticated: true },
				open: { public: true },
			},
			Mutation: {
				publish: { roles: [['editor'], ['admin']] },
				update: {
					permissions: [['notes:write']],
					when: ['notOnSunday'],
					relations: [
						{
							require: [[{ relation: 'edit', type: 'note' }]],
							onDeny: 'FORBIDDEN',
						},
					],
				},
				move: {
					relations: [
						{
							require: [
								[{ relation: 'edit', type: 'note', from: 'args.input.noteId' }],
							],
						},
					],
				},
			},
			User: {
				email: {
					relations: [
						{
							require: [
								[{ relation: 'view', type: 'user', from: 'source.id' }],
							],
						},
					],
				},
			},
		},
	},
	{ notOnSunday: ({ args }) => (args as { day?: string }).day !== 'sun' },
);

const status = (decision: Decision) =>
	decision.allow ? 200 : decision.refusal.status;

describe('the 401, 403, 404 ladder on a GraphQL field', () => {
	it('answers 401 to an anonymous caller', async () => {
		const decision = await evaluateField(policy, {
			type: 'Query',
			field: 'me',
			claims: anonymous,
		});
		expect(status(decision)).toBe(401);
	});

	it('lets an anonymous caller reach a public field', async () => {
		const decision = await evaluateField(policy, {
			type: 'Query',
			field: 'open',
			claims: anonymous,
		});
		expect(decision.allow).toBe(true);
	});

	it('answers 403 when the roles do not hold, and allows when one alternative does', async () => {
		const call = (roles: string[]) =>
			evaluateField(policy, {
				type: 'Mutation',
				field: 'publish',
				claims: user({ roles }),
			});
		expect(status(await call(['reader']))).toBe(403);
		expect(status(await call(['admin']))).toBe(200);
	});

	it('answers 403 when a condition fails, reading the args', async () => {
		const { checker } = recordingChecker();
		const call = (day: string) =>
			evaluateField(policy, {
				type: 'Mutation',
				field: 'update',
				claims: user({ scope: 'notes:write' }),
				args: { id: 'n1', day },
				relations: checker,
			});
		expect(status(await call('sun'))).toBe(403);
		expect(status(await call('mon'))).toBe(200);
	});

	it('answers a failed rung with its onDeny, reading args.id by default', async () => {
		const { checker, calls } = recordingChecker(() => false);
		const decision = await evaluateField(policy, {
			type: 'Mutation',
			field: 'update',
			claims: user({ scope: 'notes:write' }),
			args: { id: 'n1' },
			relations: checker,
		});
		expect(status(decision)).toBe(403);
		expect(calls).toHaveLength(1);
		expect(calls[0]?.[0]?.object).toEqual({ type: 'note', id: 'n1' });
	});

	it('answers 404 for a default rung, and reads an explicit args path', async () => {
		const { checker, calls } = recordingChecker(() => false);
		const decision = await evaluateField(policy, {
			type: 'Mutation',
			field: 'move',
			claims: user(),
			args: { input: { noteId: 'n2' } },
			relations: checker,
		});
		expect(status(decision)).toBe(404);
		expect(calls[0]?.[0]?.object.id).toBe('n2');
	});

	it('reads source. on a field of a returned type', async () => {
		const { checker, calls } = recordingChecker();
		await evaluateField(policy, {
			type: 'User',
			field: 'email',
			claims: user(),
			source: { id: 'u9' },
			relations: checker,
		});
		expect(calls[0]?.[0]?.object).toEqual({ type: 'user', id: 'u9' });
	});

	it('denies a missing id', async () => {
		const { checker, calls } = recordingChecker();
		const decision = await evaluateField(policy, {
			type: 'Mutation',
			field: 'move',
			claims: user(),
			args: {},
			relations: checker,
		});
		expect(status(decision)).toBe(404);
		expect(calls).toHaveLength(0);
	});
});

describe('unmatched fields', () => {
	it('refuses a root field no rule names under deny, 401 then 403', async () => {
		const call = (claims: typeof anonymous) =>
			evaluateField(policy, { type: 'Query', field: 'ghost', claims });
		expect(status(await call(anonymous))).toBe(401);
		expect(status(await call(user()))).toBe(403);
	});

	it('leaves a field of another type alone under deny', async () => {
		const decision = await evaluateField(policy, {
			type: 'Post',
			field: 'title',
			claims: anonymous,
		});
		expect(decision.allow).toBe(true);
	});

	it('does not read the prototype for a root field named constructor', async () => {
		const decision = await evaluateField(policy, {
			type: 'Query',
			field: 'constructor',
			claims: user(),
		});
		expect(status(decision)).toBe(403);
	});

	it('lets a root field through under allow', async () => {
		const open = policyOf({ global: { unmatched: 'allow' } });
		const decision = await evaluateField(open, {
			type: 'Query',
			field: 'x',
			claims: anonymous,
		});
		expect(decision.allow).toBe(true);
	});
});
