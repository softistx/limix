import { expect, test } from 'bun:test';
import type { LimixGraphqlExtras } from './index';
import * as graphql from './index';

test('./graphql exports limixGraphql and nothing else at run time', () => {
	expect(Object.keys(graphql).sort()).toEqual(['limixGraphql']);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [LimixGraphqlExtras, LimixGraphqlExtras<object>];

test('LimixGraphqlOptions is not exported', () => {
	// @ts-expect-error private: only the extras are public
	type _Gone = import('./index').LimixGraphqlOptions;
});
