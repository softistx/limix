import { describe, expect, it } from 'bun:test';
import type { Condition } from './compile/types';
import type {
	ConditionMap,
	GraphqlRulesInput,
	Permission,
	RestRulesInput,
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
	(rules: TypedRules<R>) =>
		rules;
const anyCondition: Condition = () => true;
const unmatched = { unmatched: 'deny' } as const;

describe('TypedRules (registered)', () => {
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

describe('TypedRules (unregistered)', () => {
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

describe('TypedRules stays assignable to Rules', () => {
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

const input =
	<R>() =>
	(rules: TypedRulesInput<R>) =>
		rules;
const rule = { authenticated: true } as const;

describe('TypedRulesInput: flat keys', () => {
	it('accepts a flat key the list holds', () => {
		const check = input<Reg>();
		const rules = check({
			limix: 1,
			global: unmatched,
			rest: {
				'GET /notes': rule,
				'DELETE /notes/:id': rule,
			},
			graphql: { 'Query.me': rule, 'Note.*': rule },
		});
		expect(rules.rest).toBeDefined();
	});

	it('accepts the nested method * and field * under a known key', () => {
		const rules = input<Reg>()({
			limix: 1,
			global: unmatched,
			rest: { '/notes': { '*': rule }, '/notes/:id': { GET: rule } },
			graphql: { Query: { '*': rule }, Note: { body: rule } },
		});
		expect(rules.graphql).toBeDefined();
	});

	it('refuses a flat key the list does not hold', () => {
		const check = input<Reg>();
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `GET /notez` is not a registered operation
			rest: { 'GET /notez': rule },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error PUT /notes is not registered
			rest: { 'PUT /notes': rule },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error a key written with the basePath is not registered
			rest: { 'GET /api/notes': rule },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Query.you` is not registered
			graphql: { 'Query.you': rule },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Nope.*` names no registered type
			graphql: { 'Nope.*': rule },
		});
		check({
			limix: 1,
			global: unmatched,
			// @ts-expect-error `Nope` is not a registered type, `*` or not
			graphql: { Nope: { '*': rule } },
		});
	});

	it('leaves a pattern key unchecked', () => {
		const rules = input<Reg>()({
			limix: 1,
			global: unmatched,
			rest: {
				'* /notes': rule,
				'/x/*': { GET: rule },
				'GET /a{/:b}': rule,
				'GET /files/*path': rule,
			},
		});
		expect(rules.rest).toBeDefined();
	});

	it('refuses a method map under a flat key, which parseRules refuses too', () => {
		input<{ rest: 'GET /files/*path' }>()({
			limix: 1,
			global: unmatched,
			// @ts-expect-error a flat key holds a rule, not a method map
			rest: { 'GET /files/*path': { GET: rule } },
		});
	});

	it('accepts flat graphql when only rest is registered', () => {
		const rules = input<RestOnly>()({
			limix: 1,
			global: unmatched,
			rest: { 'GET /notes': rule },
			graphql: { 'Anything.goes': rule },
		});
		expect(rules.graphql).toBeDefined();
	});

	it('accepts flat keys when nothing is registered', () => {
		const rules = input<object>()({
			limix: 1,
			global: unmatched,
			rest: { 'GET /whatever': rule },
			graphql: { 'Any.field': rule },
		});
		expect(rules.rest).toBeDefined();
	});
});

describe('TypedRulesInput and TypedRules: the terms of a rule are narrowed', () => {
	const typedInput = input<Reg>();
	const typedNested = typed<Reg>();

	it('accepts the declared roles, permissions and conditions', () => {
		const flat = typedInput({
			limix: 1,
			global: unmatched,
			rest: {
				'GET /notes': {
					roles: [['admin']],
					permissions: [['notes:read']],
					when: ['workingHours'],
				},
			},
			graphql: { 'Query.me': { roles: [['admin']] } },
		});
		const nested = typedNested({
			limix: 1,
			global: unmatched,
			rest: { '/notes': { GET: { permissions: [['notes:read']] } } },
			graphql: { Query: { me: { when: ['workingHours'] } } },
		});
		const rules: Rules = nested;
		expect([flat, rules]).toHaveLength(2);
	});

	it('refuses a role, a permission or a condition that is not declared', () => {
		const check = typedInput;
		check({
			limix: 1,
			global: unmatched,
			rest: {
				// @ts-expect-error `root` is not a declared role
				'GET /notes': { roles: [['root']] },
			},
		});
		check({
			limix: 1,
			global: unmatched,
			rest: {
				// @ts-expect-error `notes:erase` is not a declared permission
				'/notes': { GET: { permissions: [['notes:erase']] } },
			},
		});
		check({
			limix: 1,
			global: unmatched,
			rest: {
				// @ts-expect-error `weekend` is not a declared condition
				'GET /notes': { when: ['weekend'] },
			},
		});
		check({
			limix: 1,
			global: unmatched,
			graphql: {
				// @ts-expect-error `root` is not a declared role
				Query: { me: { roles: [['root']] } },
			},
		});
		typedNested({
			limix: 1,
			global: unmatched,
			rest: {
				// @ts-expect-error `root` is not a declared role
				'/notes': { GET: { roles: [['root']] } },
			},
		});
	});

	it('narrows by what is declared, whatever else is registered', () => {
		const onlyRole = input<{ role: 'admin' }>();
		onlyRole({
			limix: 1,
			global: unmatched,
			rest: { 'GET /any': { roles: [['admin']], permissions: [['free']] } },
		});
		onlyRole({
			limix: 1,
			global: unmatched,
			rest: {
				// @ts-expect-error `root` is not a declared role
				'GET /any': { roles: [['root']] },
			},
		});
	});

	it('takes the condition names as a parameter', () => {
		const withNames =
			<W extends string>() =>
			(rules: TypedRulesInput<object, W>) =>
				rules;
		withNames<'a' | 'b'>()({
			limix: 1,
			global: unmatched,
			rest: { 'GET /x': { when: ['a', 'b'] } },
		});
		withNames<'a'>()({
			limix: 1,
			global: unmatched,
			rest: {
				// @ts-expect-error `b` is not a condition of this policy
				'GET /x': { when: ['b'] },
			},
		});
	});
});

describe('RestRulesInput and GraphqlRulesInput: a block checked on its own', () => {
	type Named = Reg;
	it('accepts a valid block, flat or nested', () => {
		const rest = {
			'GET /notes': { roles: [['admin']] },
			'/notes/:id': { DELETE: { permissions: [['notes:read']] } },
		} satisfies RestRulesInput<Named>;
		const graphql = {
			'Query.me': { when: ['workingHours'] },
			Note: { body: { authenticated: true } },
		} satisfies GraphqlRulesInput<Named>;
		expect(Object.keys(rest)).toHaveLength(2);
		expect(Object.keys(graphql)).toHaveLength(2);
	});

	it('refuses an unknown flat key, nested path, field or role', () => {
		const flat = {
			// @ts-expect-error `GET /notez` is not registered
			'GET /notez': { public: true },
		} satisfies RestRulesInput<Named>;
		const nested = {
			// @ts-expect-error `/notez` is not a registered path
			'/notez': { GET: { public: true } },
		} satisfies RestRulesInput<Named>;
		const role = {
			// @ts-expect-error `root` is not a declared role
			'GET /notes': { roles: [['root']] },
		} satisfies RestRulesInput<Named>;
		const field = {
			// @ts-expect-error `Query.you` is not registered
			'Query.you': { public: true },
		} satisfies GraphqlRulesInput<Named>;
		const condition = {
			// @ts-expect-error `weekend` is not a declared condition
			'Query.me': { when: ['weekend'] },
		} satisfies GraphqlRulesInput<Named>;
		expect([flat, nested, role, field, condition]).toHaveLength(5);
	});
});
