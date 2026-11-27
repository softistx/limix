import { describe, expect, it } from 'bun:test';
import { parseRules } from '@softistx/limix';
import { rulesNames } from './names';

describe('rulesNames', () => {
	it('collects every name once, sorted, from nested alternatives', () => {
		const rules = parseRules({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'/a': {
					GET: {
						permissions: [['b:read', 'a:read'], ['b:read']],
						roles: [['admin'], ['editor', 'reviewer']],
						when: ['workingHours'],
					},
					POST: { authenticated: true },
				},
			},
			graphql: {
				Query: { me: { roles: [['admin']], when: ['atDesk', 'workingHours'] } },
				Note: { body: { permissions: [['a:read']] } },
			},
		});
		expect(rulesNames(rules)).toEqual({
			permissions: ['a:read', 'b:read'],
			roles: ['admin', 'editor', 'reviewer'],
			conditions: ['atDesk', 'workingHours'],
		});
	});

	it('gives empty lists for a document with no rules', () => {
		const rules = parseRules({ limix: 1, global: { unmatched: 'deny' } });
		expect(rulesNames(rules)).toEqual({
			permissions: [],
			roles: [],
			conditions: [],
		});
	});

	it('does not read relations', () => {
		const rules = parseRules({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'/a/:id': {
					GET: {
						relations: [{ require: [[{ relation: 'view', type: 'note' }]] }],
					},
				},
			},
		});
		expect(rulesNames(rules).permissions).toEqual([]);
	});

	it('reads the rule of a flat key, a wildcard and a Type.* rule', () => {
		const rules = parseRules({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: {
				'POST /a': { permissions: [['a:write']], roles: [['editor']] },
				'* /admin/*': { roles: [['admin']] },
				'/b': { '*': { when: ['atDesk'] } },
			},
			graphql: {
				'Query.me': { roles: [['reader']] },
				'Note.*': { permissions: [['n:read']], when: ['workingHours'] },
				Mutation: { drop: { roles: [['owner']] } },
			},
		});
		expect(rulesNames(rules)).toEqual({
			permissions: ['a:write', 'n:read'],
			roles: ['admin', 'editor', 'owner', 'reader'],
			conditions: ['atDesk', 'workingHours'],
		});
	});
});
