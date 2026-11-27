import { describe, expect, it } from 'bun:test';
import { coverage } from '@softistx/limix/coverage';
import { buildSchema } from 'graphql';
import { compiled } from './needs.fixtures';
import { graphqlOperations } from './operations';

const sdl = `
schema { query: Root mutation: Mutation }
type Root { me: User ping: String }
type Mutation { retire: Boolean }
type Query { notARoot: String }
type User { id: ID! email: String }
`;

const label = (ops: ReturnType<typeof graphqlOperations>) =>
	ops.map((o) => `${o.type}.${o.field}${o.root ? '*' : ''}`);

describe('graphqlOperations (schema)', () => {
	const schema = buildSchema(sdl);

	it('lists root fields in root order, keeping a renamed root', () => {
		expect(label(graphqlOperations(schema))).toEqual([
			'Root.me*',
			'Root.ping*',
			'Mutation.retire*',
		]);
	});

	it('adds every other object type with root false for fields: all', () => {
		expect(label(graphqlOperations(schema, { fields: 'all' }))).toEqual([
			'Root.me*',
			'Root.ping*',
			'Mutation.retire*',
			'Query.notARoot',
			'User.id',
			'User.email',
		]);
	});

	it('round-trips through coverage', () => {
		const policy = compiled({
			global: { unmatched: 'deny' },
			graphql: {
				Root: { me: { authenticated: true }, ping: { public: true } },
				User: { email: { authenticated: true } },
			},
		});
		const report = coverage(
			policy,
			graphqlOperations(schema, { fields: 'all' }),
		);
		expect(report.operations.map((o) => `${o.label} ${o.status}`)).toEqual([
			'Root.me covered',
			'Root.ping public',
			'Mutation.retire uncovered',
			'Query.notARoot uncovered',
			'User.id uncovered',
			'User.email covered',
		]);
		expect(report.stale).toEqual([]);
	});
});
