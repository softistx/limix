import { expect, test } from 'bun:test';
import { coverage } from '@softistx/limix/coverage';
import { alxiaOperations } from '@softistx/limix-alxia';
import { graphqlOperations } from '@softistx/limix-graxia';
import { freshApp } from './app.fixtures';

const sdl = await Bun.file(
	new URL('../schema.graphql', import.meta.url).pathname,
).text();

test('a rule names every route and every field, and every rule names something', async () => {
	const { app, policy } = await freshApp();
	const report = coverage(policy, [
		...alxiaOperations(app),
		...graphqlOperations(sdl, { fields: 'all' }),
	]);
	// A GraphQL field outside the roots with no rule is open by design (the
	// fields of Book, Author.id...): only a REST route or a root field counts.
	const unruled = report.operations.filter(
		(entry) =>
			entry.status === 'uncovered' &&
			(entry.operation.kind === 'rest' || entry.operation.root),
	);
	expect(unruled.map((entry) => entry.label)).toEqual([]);
	expect(report.stale).toEqual([]);
	expect(
		report.operations.filter((entry) => entry.match === 'pattern'),
	).toEqual([]);
});
