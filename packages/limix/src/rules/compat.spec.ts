// Owner-sanctioned exception (softistx/limix#60): definePolicy validates at run
// time, so the refused `GTE` call at the end is wrapped and asserts the throw.
import { expect, test } from 'bun:test';
import { definePolicy } from './define';
import type { GraphqlRule, RestRule, Rules } from './types';

// What compiled on develop must keep compiling: these are type-level cases,
// `bun check` is the test.
const global = { unmatched: 'allow' as const };
const dynamic = (value: string) => value;

test('a map of methods and a computed key still assign to Rules', () => {
	const byPath: Record<string, { GET: { public: true } }> = {
		'/x': { GET: { public: true } },
	};
	const a: Rules = { limix: 1, global, rest: byPath };
	const path = dynamic('/y');
	const b = definePolicy({
		limix: 1,
		global,
		rest: { [path]: { GET: { public: true } } },
	});
	const type = dynamic('Note');
	const field = dynamic('id');
	const byType: Record<string, Record<string, { public: true }>> = {
		Note: { id: { public: true } },
	};
	const c: Rules = { limix: 1, global, graphql: byType };
	const d = definePolicy({
		limix: 1,
		global,
		graphql: { [type]: { [field]: { public: true } } },
	});
	expect([a, b, c, d]).toHaveLength(4);
});

test('reads keep their develop types', () => {
	const rules: Rules = {
		limix: 1,
		global,
		rest: { '/x': { GET: { roles: [['a']] } } },
		graphql: { Note: { id: { roles: [['a']] } }, Query: { me: {} } },
	};
	const rest: RestRule | undefined = rules.rest?.['/x']?.GET;
	const note: GraphqlRule | undefined = rules.graphql?.['Note']?.['id'];
	const me: GraphqlRule | undefined = rules.graphql?.Query?.['me'];
	const roles: string[][] | null | undefined = rest?.roles;
	expect([rest, note, me, roles]).toHaveLength(4);
});

test('a typo under a path is still a type error', () => {
	// #60: definePolicy validates at run time now, so the refused call throws.
	const refused = () =>
		definePolicy({
			limix: 1,
			global,
			// @ts-expect-error GTE is not a method
			rest: { '/x': { GTE: { public: true } } },
		});
	expect(refused).toThrow('unknown key `GTE`');
});
