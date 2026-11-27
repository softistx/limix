import { describe, expect, it } from 'bun:test';
import { parseRules } from '@softistx/limix';
import type { Operation } from '@softistx/limix/coverage';
import { staleRules } from './stale';

const rest = (method: string, path: string): Operation => ({
	kind: 'rest',
	method,
	path,
});
const field = (type: string, name: string, root = true): Operation => ({
	kind: 'graphql',
	type,
	field: name,
	root,
});
const rule = { authenticated: true };
const rules = (body: Record<string, unknown>) =>
	parseRules({ limix: 1, global: { unmatched: 'deny' }, ...body });
const SOURCES = {
	rules: 'rules.yaml',
	openapi: 'openapi.yaml',
	graphql: 'schema.graphql',
};
const messages = (
	document: Record<string, unknown>,
	operations: readonly Operation[],
	sources = SOURCES,
) =>
	staleRules(rules(document), {
		rest: operations.filter((o) => o.kind === 'rest'),
		graphql: operations.filter((o) => o.kind === 'graphql'),
		sources,
	}).map((issue) => issue.message);

const NOTES = [rest('GET', '/notes'), rest('GET', '/notes/:id')];

describe('staleRules, REST', () => {
	it('reports a flat key no operation reaches', () => {
		expect(
			messages(
				{ rest: { 'DELETE /notes/*': rule, 'GET /notes': rule } },
				NOTES,
			),
		).toEqual([
			"rules.yaml: rest['DELETE /notes/*'] applies to no operation of openapi.yaml (no DELETE route matches /notes/*)",
		]);
	});

	it('reports a nested method by its own where', () => {
		expect(
			messages(
				{ rest: { '/nope': { GET: rule }, '/notes': { GET: rule } } },
				NOTES,
			),
		).toEqual([
			"rules.yaml: rest['/nope'].GET applies to no operation of openapi.yaml (no GET route matches /nope)",
		]);
	});

	it('words a method * rule with no route without a method', () => {
		expect(messages({ rest: { '* /admin': rule } }, NOTES)).toEqual([
			"rules.yaml: rest['* /admin'] applies to no operation of openapi.yaml (no route matches /admin)",
		]);
	});

	it('reports a rule shadowed by an earlier one', () => {
		expect(
			messages(
				{ rest: { 'GET /notes/:id': rule, '/notes/new': { GET: rule } } },
				[rest('GET', '/notes/:id')],
			),
		).toEqual([
			"rules.yaml: rest['/notes/new'].GET is shadowed by GET /notes/:id above it: it never applies",
		]);
	});

	it('reads a HEAD operation as the GET rule and honours the basePath', () => {
		expect(
			messages(
				{
					global: { unmatched: 'deny', basePath: '/api' },
					rest: { 'GET /notes': rule },
				},
				[rest('HEAD', '/api/notes')],
			),
		).toEqual([]);
	});

	it('does not report a HEAD rule the GET operation serves', () => {
		expect(
			messages({ rest: { 'HEAD /notes': rule, 'HEAD /nope': rule } }, [
				rest('GET', '/notes'),
			]),
		).toEqual([
			"rules.yaml: rest['HEAD /nope'] applies to no operation of openapi.yaml (no HEAD route matches /nope)",
		]);
	});

	it('judges nothing without an OpenAPI input', () => {
		const issues = staleRules(rules({ rest: { 'GET /nope': rule } }), {
			sources: SOURCES,
		});
		expect(issues).toEqual([]);
	});
});

describe('staleRules, GraphQL', () => {
	const schema = [
		field('Query', 'me'),
		field('Query', 'notes'),
		field('Note', 'body', false),
	];

	it('names a type the schema does not have', () => {
		expect(
			messages({ graphql: { 'Nope.*': rule, 'Nope.x': rule } }, schema),
		).toEqual([
			"rules.yaml: graphql['Nope.*'] names no type of schema.graphql",
			"rules.yaml: graphql['Nope.x'] names no type of schema.graphql",
		]);
	});

	it('names a field the type does not have', () => {
		expect(
			messages({ graphql: { 'Query.you': rule, 'Query.me': rule } }, schema),
		).toEqual([
			"rules.yaml: graphql['Query.you'] names no field of Query in schema.graphql",
		]);
	});

	it('words a nested rule by its own where', () => {
		expect(messages({ graphql: { Query: { you: rule } } }, schema)).toEqual([
			'rules.yaml: graphql.Query.you names no field of Query in schema.graphql',
		]);
	});

	it('does not report a Type.* on a type whose fields all have a rule', () => {
		expect(
			messages(
				{ graphql: { 'Query.*': rule, 'Query.me': rule, 'Query.notes': rule } },
				schema,
			),
		).toEqual([]);
	});

	it('reports a root type the schema lacks once, as a type', () => {
		expect(messages({ graphql: { 'Mutation.create': rule } }, schema)).toEqual([
			"rules.yaml: graphql['Mutation.create'] names no type of schema.graphql",
		]);
	});

	it('judges nothing without a GraphQL input', () => {
		expect(
			staleRules(rules({ graphql: { 'Nope.x': rule } }), { sources: SOURCES }),
		).toEqual([]);
	});
});

describe('staleRules, the two transports and conditions', () => {
	it('judges REST and GraphQL independently', () => {
		const issues = messages(
			{ rest: { 'GET /nope': rule }, graphql: { 'Query.you': rule } },
			[rest('GET', '/notes'), field('Query', 'me')],
		);
		expect(issues).toHaveLength(2);
	});

	it('compiles a file that names conditions without them', () => {
		expect(
			messages(
				{ rest: { 'GET /notes': { ...rule, when: ['workingHours'] } } },
				NOTES,
			),
		).toEqual([]);
	});

	it('reports a file that does not compile as its own issue', () => {
		const broken = parseRules({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: { 'GET /nope': { public: true, roles: [['admin']] } },
		});
		const issues = staleRules(broken, {
			rest: NOTES.filter((o) => o.kind === 'rest'),
			sources: SOURCES,
		});
		expect(issues).toHaveLength(1);
		expect(issues[0]?.kind).toBe('compile');
		expect(issues[0]?.message).toStartWith(
			'rules.yaml does not compile, its rules were not judged: ',
		);
	});
});
