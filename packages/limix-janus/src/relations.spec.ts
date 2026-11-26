import { describe, expect, test } from 'bun:test';
import {
	createMemoryRelations,
	defineModel,
	permissions,
	when,
} from '@softistx/janus/permissions';
import {
	compilePolicy,
	definePolicy,
	evaluateField,
	evaluateRest,
	type RelationQuery,
} from '@softistx/limix';
import { ada, bob, model, policy, seeded } from './janus.fixtures';
import { janusRelations } from './relations';

const query = (id: string, relation = 'view'): RelationQuery => ({
	subject: ada,
	relation,
	object: { type: 'document', id },
});

const claims = (subject: { type: string; id: string }) => ({
	authenticated: true,
	subject,
});

const get = (
	checker: ReturnType<typeof janusRelations>,
	who = ada,
	id = 'd1',
) =>
	evaluateRest(policy, {
		method: 'GET',
		path: `/documents/${id}`,
		claims: claims(who),
		relations: checker,
	});

describe('janusRelations', () => {
	test('answers in the order of the queries', async () => {
		const checker = janusRelations({ access: await seeded() });
		const answers = await checker.check([
			query('d1', 'edit'),
			query('nope'),
			query('d1'),
			{ ...query('d1', 'edit'), subject: bob },
		]);
		expect(answers).toEqual([true, false, true, false]);
	});

	test('allows and denies a REST request end to end', async () => {
		const checker = janusRelations({ access: await seeded() });
		expect(await get(checker)).toEqual({ allow: true });
		const denied = await get(checker, ada, 'other');
		expect(denied.allow).toBe(false);
		expect(denied.allow === false && denied.refusal.status).toBe(404);
	});

	test('walks the ladder: a viewer may read but not edit', async () => {
		const checker = janusRelations({ access: await seeded() });
		const put = (who: typeof ada) =>
			evaluateRest(policy, {
				method: 'PUT',
				path: '/documents/d1',
				claims: claims(who),
				relations: checker,
			});
		expect(await put(ada)).toEqual({ allow: true });
		const refused = await put(bob);
		expect(refused.allow === false && refused.refusal.status).toBe(403);
	});

	test('allows and denies a GraphQL field end to end', async () => {
		const checker = janusRelations({ access: await seeded() });
		const field = (id: string) =>
			evaluateField(policy, {
				type: 'Query',
				field: 'document',
				claims: claims(bob),
				args: { id },
				relations: checker,
			});
		expect(await field('d1')).toEqual({ allow: true });
		expect((await field('d2')).allow).toBe(false);
	});

	test('subjectOf maps the claims subject to a janus subject', async () => {
		const checker = janusRelations({
			access: await seeded(),
			subjectOf: ({ id }) => ({ type: 'user', id: id.replace('acct:', '') }),
		});
		const answers = await checker.check([
			{ ...query('d1', 'edit'), subject: { type: 'account', id: 'acct:ada' } },
		]);
		expect(answers).toEqual([true]);
	});

	test('propagates a store failure instead of denying', async () => {
		const memory = createMemoryRelations();
		await seeded(memory);
		const down = () => Promise.reject(new Error('store down'));
		const store = {
			...memory,
			has: down,
			findEntities: down,
			findSubjectSets: down,
		};
		const checker = janusRelations({
			access: permissions({ model, store }),
		});
		const failure = await checker.check([query('d1')]).catch((e) => e);
		expect(failure).toMatchObject({ code: 'STORE_FAILED' });
		await expect(get(checker)).rejects.toMatchObject({ code: 'STORE_FAILED' });
	});

	test('an unknown relation propagates janus TypeError through evaluateRest', async () => {
		const checker = janusRelations({ access: await seeded() });
		const bad = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: {
					'/documents/:id': {
						GET: {
							relations: [
								{ require: [[{ relation: 'purge', type: 'document' }]] },
							],
						},
					},
				},
			}),
		);
		await expect(
			evaluateRest(bad, {
				method: 'GET',
				path: '/documents/d1',
				claims: claims(ada),
				relations: checker,
			}),
		).rejects.toThrow(
			'can: "purge" is not a relation or a permission of document',
		);
	});

	test('ctxOf reaches a janus when; without it janus throws', async () => {
		const shiftModel = defineModel({
			subjects: ['user'],
			types: {
				ward: {
					related: { nurses: ['user'] },
					permits: {
						enter: [when('nurses', (ctx: { onShift: boolean }) => ctx.onShift)],
					},
				},
			},
		});
		const access = permissions({
			model: shiftModel,
			store: createMemoryRelations(),
		});
		await access.grant({ type: 'ward', id: 'w1' }, 'nurses', ada);
		const q: RelationQuery = {
			subject: ada,
			relation: 'enter',
			object: { type: 'ward', id: 'w1' },
		};
		await expect(janusRelations({ access }).check([q])).rejects.toThrow(
			'can: ward.enter reaches a condition, and no ctx was passed',
		);
		const onShift = janusRelations({
			access,
			ctxOf: () => ({ onShift: true }),
		});
		expect(await onShift.check([q])).toEqual([true]);
		const off = janusRelations({ access, ctxOf: () => ({ onShift: false }) });
		expect(await off.check([q])).toEqual([false]);
	});

	test('a non-boolean answer of can throws a TypeError', async () => {
		const access = { can: async () => 'yes' } as unknown as Pick<
			ReturnType<typeof permissions<typeof model.definition>>,
			'can'
		>;
		await expect(
			janusRelations({ access }).check([query('d1')]),
		).rejects.toThrow(
			new TypeError('limix-janus: access.can answered string, not a boolean'),
		);
	});

	test('rejects a wrong access at compile time', async () => {
		const real = await seeded();
		// @ts-expect-error a can that is not janus's
		janusRelations({ access: { can: async (_a: number) => true } });
		// @ts-expect-error the model is not the access
		janusRelations({ access: model });
		janusRelations({ access: real });
	});
});
