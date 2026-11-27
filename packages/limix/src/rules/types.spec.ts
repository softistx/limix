import { expect, test } from 'bun:test';
import type { z } from 'zod';
import type { RulesSchema } from './schema';
import type { GraphqlRule, RestRule, Rules } from './types';

type Inferred = z.infer<typeof RulesSchema>;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// A drift between the explicit types and the schema fails `bun check`.
export const _rules: Mutual<Rules, Inferred> = true;
export const _rest: Mutual<
	RestRule,
	NonNullable<NonNullable<Inferred['rest']>[string]['GET']>
> = true;
export const _graphql: Mutual<
	GraphqlRule,
	NonNullable<Inferred['graphql']>[string][string]
> = true;

// A type alias, not an interface, so a `Rules` value assigns to a record.
export const _record: Record<string, unknown> = {} as Rules;

test('the explicit Rules type matches the schema', () => {
	expect(_rules && _rest && _graphql).toBe(true);
});
