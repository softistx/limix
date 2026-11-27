import { describe, expect, test } from 'bun:test';

const examples = '../examples/migrating-from-security';

describe('claimsOf', () => {
	test('an anonymous caller, or one with neither sub nor clientId, is not signed in', async () => {
		const { claimsOf } = await import(`${examples}/evaluate-rest`);
		expect(claimsOf(undefined)).toEqual({ authenticated: false });
		expect(claimsOf({ roles: ['A'] })).toEqual({ authenticated: false });
	});

	test('a token with authorities only keeps them as roles, without duplicates', async () => {
		const { claimsOf } = await import(`${examples}/evaluate-rest`);
		const claims = claimsOf({
			sub: 'u1',
			authorities: ['ADMIN', 'USER'],
			roles: ['USER'],
		});
		expect(claims).toEqual({
			authenticated: true,
			subject: { type: 'user', id: 'u1' },
			roles: ['ADMIN', 'USER'],
		});
	});

	test('a clientId-only token is signed in, as a client', async () => {
		const { claimsOf } = await import(`${examples}/evaluate-rest`);
		expect(claimsOf({ clientId: 'billing', scope: 'a b' })).toEqual({
			authenticated: true,
			subject: { type: 'client', id: 'billing' },
			roles: [],
			scope: 'a b',
		});
	});

	test('scopeAsRoles adds the scope tokens to the roles, as 5.x read them', async () => {
		const { claimsOf } = await import(`${examples}/evaluate-rest`);
		const claims = claimsOf(
			{ sub: 'u1', roles: ['USER'], scope: 'notes:read USER' },
			{ scopeAsRoles: true },
		);
		expect(claims.roles).toEqual(['USER', 'notes:read']);
		expect(claimsOf({ sub: 'u1', scope: 'notes:read' }).roles).toEqual([]);
	});
});

describe('the evaluator examples', () => {
	test('mayDelete answers with the refusal status and code', async () => {
		const { policy } = await import(`${examples}/rules`);
		const { claimsOf, mayDelete } = await import(`${examples}/evaluate-rest`);
		expect(await mayDelete(policy, claimsOf(undefined), '1')).toEqual({
			status: 401,
			code: 'auth.errors.unauthenticated',
		});
		expect(
			await mayDelete(policy, claimsOf({ sub: 'u1', roles: ['ADMIN'] }), '1'),
		).toEqual({
			status: 403,
			code: 'auth.errors.forbidden',
		});
		expect(
			await mayDelete(
				policy,
				claimsOf({ sub: 'u1', roles: ['ADMIN', 'AUDIT'] }),
				'1',
			),
		).toEqual({ status: 200 });
	});

	test('mayReadMe and onError', async () => {
		const { policy } = await import(`${examples}/rules`);
		const { claimsOf } = await import(`${examples}/evaluate-rest`);
		const { mayReadMe, onError } = await import(`${examples}/evaluate-field`);
		expect(await mayReadMe(policy, claimsOf(undefined))).toBe(
			'auth.errors.unauthenticated',
		);
		expect(await mayReadMe(policy, claimsOf({ sub: 'u1' }))).toBe('allowed');
		expect(onError(new Error('x'))).toBeUndefined();
	});

	test('relationsOver sends the bare subject id, as 5.x did', async () => {
		const { relationsOver } = await import(`${examples}/relations`);
		const asked: string[][] = [];
		const checker = relationsOver(async (tuples: readonly string[]) => {
			asked.push([...tuples]);
			return tuples.map(() => true);
		});
		const answers = await checker.check([
			{
				subject: { type: 'user', id: 'u1' },
				relation: 'view',
				object: { type: 'bookmark', id: 'b1' },
			},
		]);
		expect(answers).toEqual([true]);
		expect(asked).toEqual([['bookmark:b1#view@u1']]);
	});
});
