import { describe, expect, test } from 'bun:test';
import { buildSchema } from 'graphql';
import { entryOf, governs, rootNames } from './governs';
import { fixtureSchema, policy } from './schema.fixtures';

describe('entryOf', () => {
	test('finds a rule and ignores inherited keys', () => {
		expect(entryOf(policy, 'Query', 'me')?.rule.authenticated).toBe(true);
		expect(entryOf(policy, 'Query', 'constructor')).toBeUndefined();
		expect(entryOf(policy, 'toString', 'me')).toBeUndefined();
		expect(entryOf(policy, 'Note', 'title')).toBeUndefined();
	});
});

describe('governs', () => {
	test('a named field, and an unmatched root field under deny', () => {
		expect(governs(policy, 'Note', 'body', false)).toBe(true);
		expect(governs(policy, 'Query', 'notes', true)).toBe(true);
	});

	test('an unmatched field of another type is not governed', () => {
		expect(governs(policy, 'Note', 'title', false)).toBe(false);
	});
});

describe('rootNames', () => {
	test('follows renamed roots', () => {
		expect([...rootNames(fixtureSchema())]).toEqual([
			'Query',
			'Mutation',
			'Subscription',
		]);
		const renamed = buildSchema(
			'schema { query: Root } type Root { a: String }',
		);
		expect([...rootNames(renamed)]).toEqual(['Root']);
	});
});
