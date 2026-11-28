import { describe, expect, it } from 'bun:test';
import {
	type ConditionName,
	compilePolicy,
	definePolicy,
	type Permission,
	type Role,
} from '@softistx/limix';
import type { GraphqlRules, LimixRest, RestRules } from './generated.fixtures';

const unmatched = { unmatched: 'deny' } as const;
const rule = { authenticated: true } as const;

describe('the generated augmentation', () => {
	it('registers the operations in definePolicy', () => {
		const known: LimixRest = 'GET /notes';
		const rules = definePolicy({
			limix: 1,
			global: unmatched,
			rest: {
				'/notes': { GET: rule },
				'/notes/:id': { GET: rule, DELETE: rule },
				'/files/*path': { GET: rule },
			},
			graphql: {
				Query: { me: rule },
				Mutation: { createNote: rule },
				Note: { body: rule },
			},
		});
		expect(known).toBe('GET /notes');
		expect(rules.rest).toBeDefined();
	});

	it('refuses an operation the API does not have', () => {
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `/notez` is not an operation of the API
			rest: { '/notez': { GET: rule } },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error the API has no PUT /notes
			rest: { '/notes': { PUT: rule } },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Query.you` is not a field
			graphql: { Query: { you: rule } },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Nope` is not a type
			graphql: { Nope: { me: rule } },
		});
	});

	it('types the names', () => {
		const permission: Permission = 'notes:read';
		const role: Role = 'admin';
		const condition: ConditionName = 'workingHours';
		// @ts-expect-error `nope` is not a permission of the rules file
		const nope: Permission = 'nope';
		expect([permission, role, condition, nope]).toHaveLength(4);
	});

	it('refuses a condition the rules file does not name', () => {
		const rules = definePolicy({ limix: 1, global: unmatched });
		expect(
			compilePolicy(rules, { conditions: { workingHours: () => true } }),
		).toBeDefined();
		expect(() =>
			// @ts-expect-error `other` is not a condition of the rules file
			compilePolicy(rules, { conditions: { other: () => true } }),
		).not.toThrow();
	});
});

describe('the generated augmentation, flat keys', () => {
	it('registers flat keys, Type.* and the nested wildcards', () => {
		const rules = definePolicy({
			limix: 1,
			global: unmatched,
			rest: {
				'GET /notes': rule,
				'DELETE /notes/:id': rule,
				'/notes/:id': { '*': rule },
				'* /admin/*': rule,
				'/files/*path': { GET: rule },
			},
			graphql: {
				'Query.me': rule,
				'Note.*': rule,
				Mutation: { '*': rule },
			},
		});
		expect(rules.rest).toBeDefined();
	});

	it('refuses a flat key the API does not have', () => {
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `GET /notez` is not an operation of the API
			rest: { 'GET /notez': rule },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error the API has no PUT /notes
			rest: { 'PUT /notes': rule },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Query.you` is not a field
			graphql: { 'Query.you': rule },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Nope` is not a type
			graphql: { 'Nope.*': rule },
		});
		definePolicy({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Nope` is not a type
			graphql: { Nope: { '*': rule } },
		});
	});
});

describe('the generated augmentation, the vocabulary declared by hand', () => {
	// vocabulary.fixtures.ts declares notes:read, notes:write, admin and workingHours.
	it('narrows roles, permissions and when in a rule', () => {
		const rules = definePolicy({
			limix: 1,
			global: unmatched,
			rest: {
				'GET /notes': { permissions: [['notes:read']] },
				'/notes/:id': {
					DELETE: {
						roles: [['admin']],
						permissions: [['notes:write']],
						when: ['workingHours'],
					},
				},
			},
		});
		expect(rules.rest?.['/notes/:id']?.DELETE?.when).toEqual(['workingHours']);
	});

	it('refuses a name nobody declared', () => {
		const refused = () => {
			definePolicy({
				limix: 1,
				global: unmatched,
				rest: {
					// @ts-expect-error `root` is not a declared role
					'GET /notes': { roles: [['root']] },
				},
			});
			definePolicy({
				limix: 1,
				global: unmatched,
				graphql: {
					// @ts-expect-error `notes:erase` is not a declared permission
					'Query.me': { permissions: [['notes:erase']] },
				},
			});
			definePolicy({
				limix: 1,
				global: unmatched,
				rest: {
					// @ts-expect-error `weekend` is not a declared condition
					'/notes': { GET: { when: ['weekend'] } },
				},
			});
		};
		expect(refused).toBeInstanceOf(Function);
	});

	it('takes the conditions of the compile call as the names of `when`', () => {
		const conditions = { workingHours: () => true };
		const rules = definePolicy(
			{
				limix: 1,
				global: unmatched,
				rest: { 'GET /notes': { when: ['workingHours'] } },
			},
			{ conditions },
		);
		expect(compilePolicy(rules, { conditions })).toBeDefined();
	});
});

describe('the generated RestRules and GraphqlRules aliases', () => {
	it('accepts a valid block and splits a policy across blocks', () => {
		const reads = {
			'GET /notes': { permissions: [['notes:read']] },
		} satisfies RestRules<'workingHours'>;
		const writes = {
			'/notes/:id': {
				DELETE: { roles: [['admin']], when: ['workingHours'] },
			},
		} satisfies RestRules<'workingHours'>;
		const fields = {
			'Query.me': rule,
		} satisfies GraphqlRules<'workingHours'>;
		const rules = definePolicy({
			limix: 1,
			global: unmatched,
			rest: [reads, writes],
			graphql: fields,
		});
		expect(rules.rest?.['/notes']?.GET).toBeDefined();
		expect(rules.rest?.['/notes/:id']?.DELETE).toBeDefined();
	});

	it('refuses an unknown path, role or condition in a block', () => {
		const refused = () => {
			// @ts-expect-error `/notez` is not an operation of the API
			const path = { 'GET /notez': rule } satisfies RestRules<'workingHours'>;
			const role = {
				// @ts-expect-error `root` is not a declared role
				'GET /notes': { roles: [['root']] },
			} satisfies RestRules<'workingHours'>;
			const condition = {
				// @ts-expect-error `weekend` is not among the condition names given
				'GET /notes': { when: ['weekend'] },
			} satisfies RestRules<'workingHours'>;
			const field = {
				// @ts-expect-error `Query.you` is not a field
				'Query.you': rule,
			} satisfies GraphqlRules<'workingHours'>;
			return [path, role, condition, field];
		};
		expect(refused).toBeInstanceOf(Function);
	});

	it('reports a typo inside an inline list on the `rest` key, and at its own key with satisfies', () => {
		const refused = () => {
			definePolicy({
				limix: 1,
				global: unmatched,
				// @ts-expect-error TS2769 on the list: no overload matches, the block holding the typo is not named
				rest: [{ 'GET /notes': rule }, { 'GET /notez': rule }],
			});
			return {
				// @ts-expect-error `/notez` is not an operation: with satisfies the error is at the block's own key
				'GET /notez': rule,
			} satisfies RestRules;
		};
		expect(refused).toBeInstanceOf(Function);
	});
});
