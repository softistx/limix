import { expect, test } from 'bun:test';
import * as graphql from './index';

test('./graphql exports limixGraphql and nothing else at run time', () => {
	expect(Object.keys(graphql).sort()).toEqual(['limixGraphql']);
});
