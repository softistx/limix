import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { FIXTURE_INPUT } from './codegen.fixtures';
import { generateModule, type ModuleInput, sourceNames } from './module';

const rest = (method: string, path: string) =>
	({ kind: 'rest', method, path }) as const;

describe('generateModule', () => {
	it('matches the committed golden file byte for byte', async () => {
		const golden = await Bun.file(
			new URL('./generated.fixtures.ts', import.meta.url),
		).text();
		expect(generateModule(FIXTURE_INPUT)).toBe(golden);
	});

	it('ends with one newline and uses LF', () => {
		const text = generateModule(FIXTURE_INPUT);
		expect(text.endsWith('}\n')).toBe(true);
		expect(text).not.toContain('\r');
	});

	it('writes a union on one line up to 80 columns and breaks it past that', () => {
		const one = generateModule({
			sources: ['x'],
			rest: [rest('GET', `/${'a'.repeat(48)}`)],
		});
		const line = `export type LimixRest = 'GET /${'a'.repeat(48)}';`;
		expect(line).toHaveLength(80);
		expect(one).toContain(`${line}\n`);
		const over = generateModule({
			sources: ['x'],
			rest: [rest('GET', `/${'a'.repeat(49)}`)],
		});
		expect(over).toContain(
			`export type LimixRest =\n\t| 'GET /${'a'.repeat(49)}';`,
		);
	});

	it('writes never for an empty list', () => {
		const text = generateModule({ sources: ['x'], rest: [] });
		expect(text).toContain('export type LimixRest = never;');
	});

	it('writes only the keys whose source was given', () => {
		const onlyRest = generateModule({
			sources: ['o'],
			rest: [rest('GET', '/a')],
		});
		expect(onlyRest).toContain('\t\trest: LimixRest;');
		expect(onlyRest).not.toContain('graphql:');
		expect(onlyRest).not.toContain('permission:');
		const onlyGraphql = generateModule({
			sources: ['s'],
			graphql: [{ kind: 'graphql', type: 'Query', field: 'me', root: true }],
		});
		expect(onlyGraphql).toContain('\t\tgraphql: LimixGraphql;');
		expect(onlyGraphql).not.toContain('rest:');
	});

	it('registers the operations only: no permission, role or condition', () => {
		const text = generateModule(FIXTURE_INPUT);
		for (const key of ['permission', 'role', 'condition']) {
			expect(text).not.toContain(`${key}:`);
		}
	});

	it('gives the same bytes whatever the order of the input', () => {
		const shuffled: ModuleInput = {
			...FIXTURE_INPUT,
			rest: [...(FIXTURE_INPUT.rest ?? [])].reverse(),
			graphql: [...(FIXTURE_INPUT.graphql ?? [])].reverse(),
		};
		expect(generateModule(shuffled)).toBe(generateModule(FIXTURE_INPUT));
	});

	it('escapes quotes and backslashes in a literal', () => {
		const text = generateModule({
			sources: ['x'],
			rest: [rest('GET', "/it's\\here")],
		});
		expect(text).toContain("'GET /it\\'s\\\\here'");
	});

	it('refuses an input with no source', () => {
		expect(() => generateModule({ sources: [] })).toThrow(
			'nothing to generate: no OpenAPI or GraphQL',
		);
	});
});

describe('sourceNames', () => {
	it('is relative, with slashes, sorted and without duplicates', () => {
		expect(
			sourceNames(['b.yaml', resolve('a/x.yaml'), 'b.yaml', './a/../c.yaml']),
		).toEqual(['a/x.yaml', 'b.yaml', 'c.yaml']);
	});

	it('gives the same names whatever the order', () => {
		expect(sourceNames(['one.yaml', 'two.yaml'])).toEqual(
			sourceNames(['two.yaml', 'one.yaml']),
		);
	});

	it('writes the regenerate sentence it is given', () => {
		const text = generateModule({
			sources: ['x'],
			rest: [],
			regenerate: 'run graphql-codegen again',
		});
		expect(text).toContain('// Do not edit: run graphql-codegen again.\n');
	});
});
