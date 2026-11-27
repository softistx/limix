import { describe, expect, it } from 'bun:test';
import { printSchemaFor } from '@softistx/graxia/agent';
import { canOf } from './can';
import { schemaOf } from './needs.fixtures';

const schema = schemaOf(`
type Query {
  open: String
  write: String @needs(permission: "books:write")
}`);

describe('canOf', () => {
	it('holds a permission of the scope', () => {
		const can = canOf({ authenticated: true, scope: 'books:write openid' });
		expect(can('books:write')).toBe(true);
		expect(can('books:read')).toBe(false);
	});

	it('also needs the permissions list when the claim is there', () => {
		const can = canOf({
			authenticated: true,
			scope: 'a b',
			permissions: ['a'],
		});
		expect([can('a'), can('b')]).toEqual([true, false]);
	});

	it('holds nothing when anonymous, even with a scope', () => {
		expect(canOf({ authenticated: false, scope: 'a' })('a')).toBe(false);
	});

	it('never reads roles', () => {
		expect(canOf({ authenticated: true, roles: ['a'] })('a')).toBe(false);
	});

	it('throws a TypeError for a non-object', () => {
		expect(() => canOf(null as never)).toThrow(TypeError);
		expect(() => canOf('x' as never)).toThrow(TypeError);
	});

	it('hides a @needs field in the printed schema for a caller without it', () => {
		const hidden = printSchemaFor(schema, {
			can: canOf({ authenticated: true, scope: '' }),
		});
		const shown = printSchemaFor(schema, {
			can: canOf({ authenticated: true, scope: 'books:write' }),
		});
		expect(hidden).not.toContain('write');
		expect(shown).toContain('write');
	});
});
