import { expect, test } from 'bun:test';
import type { LimixGraphqlExtras, LimixGraphqlOptions } from './index';
import * as graphql from './index';

test('./graphql exports limixGraphql and nothing else at run time', () => {
	expect(Object.keys(graphql).sort()).toEqual(['limixGraphql']);
});

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [
	LimixGraphqlExtras<object>,
	LimixGraphqlOptions<object, '/graphql', object, object, never>,
];
