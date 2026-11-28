// Frozen at 0f5a782 (before TypedRulesInput): the cases of register.spec.ts as they
// were, run through TypedRulesInput. Never edit a case, only add: a program that
// type-checked then must type-check now, and a refusal must still refuse.
// Owner-sanctioned exception (softistx/limix#60): `RulesInput` is gone (the rules
// format is nested only), so the two cases that named it are written against
// `Rules` and against the open shape, and the refused FETCH call is wrapped
// (definePolicy validates at run time now), as comments below say.
import { describe, expect, it } from 'bun:test';
import type { Condition } from './compile/types';
import { definePolicy } from './define';
import type {
	ConditionMap,
	Permission,
	TypedRules,
	TypedRulesInput,
} from './register';
import type { Rules } from './schema';

type Reg = {
	rest: 'GET /notes' | 'GET /notes/:id' | 'DELETE /notes/:id';
	graphql: 'Query.me' | 'Note.body';
	permission: 'notes:read';
	role: 'admin';
	condition: 'workingHours';
};
type RestOnly = { rest: 'GET /notes' };

const typed =
	<R>() =>
	(rules: TypedRulesInput<R>) =>
		rules;
const anyCondition: Condition = () => true;
const unmatched = { unmatched: 'deny' } as const;

describe('TypedRulesInput (registered)', () => {
	it('accepts the registered operations', () => {
		const rules = typed<Reg>()({
			limix: 1,
			global: unmatched,
			rest: {
				'/notes': { GET: { authenticated: true } },
				'/notes/:id': {
					GET: { authenticated: true },
					DELETE: { authenticated: true },
				},
				'/files/*path': { GET: { authenticated: true } },
				'/a{/:b}': { POST: { authenticated: true } },
			},
			graphql: {
				Query: { me: { authenticated: true } },
				Note: { body: { authenticated: true } },
			},
		});
		expect(rules.limix).toBe(1);
	});

	it('refuses what the list does not hold', () => {
		const check = typed<Reg>();
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `/notez` is not a registered path
			rest: { '/notez': { GET: { authenticated: true } } },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error PUT is not registered on /notes/:id
			rest: { '/notes/:id': { PUT: { authenticated: true } } },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error a key written with the basePath is not registered
			rest: { '/api/notes': { GET: { authenticated: true } } },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Query.you` is not registered
			graphql: { Query: { you: { authenticated: true } } },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Nope` is not a registered type
			graphql: { Nope: { me: { authenticated: true } } },
		});
	});

	it('leaves graphql unchecked when only rest is registered', () => {
		const rules = typed<RestOnly>()({
			limix: 1,
			global: unmatched,
			rest: { '/notes': { GET: { authenticated: true } } },
			graphql: { Anything: { goes: { authenticated: true } } },
		});
		expect(rules.graphql).toBeDefined();
	});
});

describe('TypedRulesInput (unregistered)', () => {
	it('accepts any path and type', () => {
		const rules = typed<object>()({
			limix: 1,
			global: unmatched,
			rest: { '/whatever': { GET: { authenticated: true } } },
			graphql: { Any: { field: { authenticated: true } } },
		});
		expect(rules.rest).toBeDefined();
	});
});

describe('TypedRulesInput: TypedRules stays assignable', () => {
	it('holds with rest only, graphql only and both registered', () => {
		const both: TypedRules<Reg> = { limix: 1, global: unmatched };
		const rest: TypedRules<RestOnly> = { limix: 1, global: unmatched };
		const graphql: TypedRules<{ graphql: 'Query.me' }> = {
			limix: 1,
			global: unmatched,
			graphql: { Query: { me: { authenticated: true } } },
		};
		const a: Rules = both;
		const b: Rules = rest;
		const c: Rules = graphql;
		expect([a, b, c]).toHaveLength(3);
	});
});

describe('names', () => {
	it('narrows Permission when registered, else string', () => {
		const ok: Permission<Reg> = 'notes:read';
		// @ts-expect-error `x` is not a registered permission
		const bad: Permission<Reg> = 'x';
		const free: Permission<object> = 'anything';
		expect([ok, bad, free]).toHaveLength(3);
	});

	it('narrows ConditionMap when registered, else any key', () => {
		const ok: ConditionMap<Reg> = { workingHours: anyCondition };
		const none: ConditionMap<Reg> = {};
		// @ts-expect-error `other` is not a registered condition
		const bad: ConditionMap<Reg> = { other: anyCondition };
		const free: ConditionMap<object> = { whatever: anyCondition };
		expect([ok, none, bad, free]).toHaveLength(4);
	});
});

describe('TypedRulesInput widens TypedRules, never narrows it', () => {
	it('takes a TypedRules value, as a Rules and as a RulesInput', () => {
		const both: TypedRules<Reg> = { limix: 1, global: unmatched };
		const input: TypedRulesInput<Reg> = both;
		const rules: Rules = both;
		// #60: was `const asInput: RulesInput = both;`
		const asInput: TypedRulesInput<object> = both;
		expect([input, rules, asInput]).toHaveLength(3);
	});

	it('is open when nothing is registered', () => {
		// #60: was `Same<TypedRulesInput<object>, RulesInput>`, and now that the
		// open shape is unexported, it holds a flat and a nested spelling.
		const open: TypedRulesInput<object> = {
			limix: 1,
			global: unmatched,
			rest: { 'GET /a': { public: true }, '/b': { GET: { public: true } } },
			graphql: { 'Query.me': { public: true }, Note: { id: { public: true } } },
		};
		expect(open.limix).toBe(1);
	});

	it('keeps definePolicy accepting and refusing what it did', () => {
		expect(
			definePolicy({
				limix: 1,
				global: unmatched,
				rest: { '/notes': { GET: { authenticated: true } } },
			}).rest,
		).toBeDefined();
		// #60: definePolicy validates at run time now, so the refused call is
		// only type-checked (it was run before, as the identity).
		const refused = () =>
			definePolicy({
				limix: 1,
				global: unmatched,
				// @ts-expect-error a method the rule does not know is still refused
				rest: { '/notes': { FETCH: { authenticated: true } } },
			});
		expect(refused).toThrow('unknown key `FETCH`');
	});
});
