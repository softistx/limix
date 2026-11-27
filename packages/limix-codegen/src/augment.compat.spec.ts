// Frozen at 0f5a782: augment.spec.ts as it was, against generated.fixtures.ts.
// Never edit a case, only add: every @ts-expect-error must still fire.
import { describe, expect, it } from 'bun:test';
import {
	type ConditionName,
	compilePolicy,
	definePolicy,
	type Permission,
	type Role,
} from '@softistx/limix';
import type { LimixRest } from './generated.fixtures';

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
