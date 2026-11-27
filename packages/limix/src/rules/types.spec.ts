import { expect, test } from 'bun:test';
import type { z } from 'zod';
import type { zGraphqlRule } from './graphql';
import type { zMethods, zRestRule } from './rest';
import type { RulesSchema } from './schema';
import type { GraphqlRule, RestMethods, RestRule, Rules } from './types';

type Inferred = z.infer<typeof RulesSchema>;
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

// A drift between the explicit types and the schema fails `bun check`.
export const _rules: Mutual<Rules, Inferred> = true;
// The schema types the keys of `rest` and `graphql` as the explicit `Rules`
// (an intersection of records infers nothing useful), so the rule and method
// shapes are held to their own schemas.
export const _rest: Mutual<RestRule, z.infer<typeof zRestRule>> = true;
export const _methods: Mutual<RestMethods, z.infer<typeof zMethods>> = true;
export const _graphql: Mutual<GraphqlRule, z.infer<typeof zGraphqlRule>> = true;

// A rule is read through a flat key and a nested one.
type RestEntries = NonNullable<Rules['rest']>;
export const _flatRest: Mutual<RestEntries['GET /x'], RestRule> = true;
export const _nestedRest: Mutual<RestMethods['GET'], RestRule | undefined> =
	true;
export const _flatGraphql: Mutual<
	NonNullable<Rules['graphql']>['Query.me'],
	GraphqlRule
> = true;

// A type alias, not an interface, so a `Rules` value assigns to a record.
export const _record: Record<string, unknown> = {} as Rules;

test('the explicit Rules type matches the schema', () => {
	expect(_rules && _rest && _methods && _graphql).toBe(true);
});
