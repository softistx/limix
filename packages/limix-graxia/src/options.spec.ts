import { describe, expect, test } from 'bun:test';
import { staticSource } from '@softistx/limix';
import { checkOptions } from './options';
import { claims, policy } from './schema.fixtures';

const ok = { policy, claims: () => claims.admin };

describe('checkOptions', () => {
	test('accepts a compiled policy and a source', () => {
		expect(() => checkOptions('t()', ok)).not.toThrow();
		expect(() =>
			checkOptions('t()', { ...ok, policy: staticSource(policy) }),
		).not.toThrow();
	});

	test('names the caller in each refusal', () => {
		expect(() => checkOptions('t()', undefined as never)).toThrow('t(): pass');
		expect(() => checkOptions('t()', { claims: ok.claims } as never)).toThrow(
			'pass `policy`',
		);
		expect(() =>
			checkOptions('t()', { ...ok, policy: { nope: 1 } as never }),
		).toThrow('neither a compiled policy');
		expect(() => checkOptions('t()', { policy } as never)).toThrow(
			'pass `claims`',
		);
		expect(() => checkOptions('t()', { ...ok, nonNull: 'x' as never })).toThrow(
			"'refuse' or 'allow'",
		);
	});

	test('a static policy that uses relations needs a checker', () => {
		const relational = { ...policy, usesRelations: true };
		expect(() => checkOptions('t()', { ...ok, policy: relational })).toThrow(
			'the rules use relations; pass `relations`',
		);
		expect(() =>
			checkOptions('t()', {
				...ok,
				policy: relational,
				relations: { check: async () => [] } as never,
			}),
		).not.toThrow();
	});
});
