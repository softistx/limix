import { describe, expect, test } from 'bun:test';
import {
	createMemoryRelations,
	permissions,
} from '@softistx/janus/permissions';
import {
	evaluateField,
	evaluateRest,
	type RelationQuery,
} from '@softistx/limix';
import { ada, bob, model, policy, seeded } from './fixtures';
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
		await expect(checker.check([query('d1')])).rejects.toThrow();
		await expect(get(checker)).rejects.toThrow();
	});
});
