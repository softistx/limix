import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSchema } from 'graphql';
import {
	FIXTURE_INPUT,
	FIXTURE_OPENAPI_YAML,
	FIXTURE_RULES_YAML,
	FIXTURE_SDL,
} from '../codegen.fixtures';
import { generateModule, sourceNames } from '../module';
import type { LimixCodegenPluginConfig } from './index';
import * as api from './index';

// A removed or renamed type fails `bun check`, which also covers the specs.
export type _Types = [LimixCodegenPluginConfig];

describe('the graphql-codegen plugin', () => {
	it('exports plugin alone', () => {
		expect(Object.keys(api).sort()).toEqual(['plugin']);
	});

	it('gives what generateModule gives for the same inputs', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'limix-codegen-'));
		try {
			const openapi = join(dir, 'openapi.yaml');
			const rules = join(dir, 'rules.yaml');
			await Bun.write(openapi, FIXTURE_OPENAPI_YAML);
			await Bun.write(rules, FIXTURE_RULES_YAML);
			const output = await api.plugin(buildSchema(FIXTURE_SDL), [], {
				openapi,
				rules,
			});
			expect(output).toBe(
				generateModule({
					...FIXTURE_INPUT,
					sources: ['the GraphQL schema', ...sourceNames([openapi, rules])],
					regenerate: 'run graphql-codegen again',
				}),
			);
		} finally {
			await rm(dir, { recursive: true });
		}
	});

	it('writes graphql alone without other inputs', async () => {
		const output = await api.plugin(buildSchema(FIXTURE_SDL), [], {});
		expect(output).toContain('graphql: LimixGraphql;');
		expect(output).not.toContain('rest:');
	});

	it('ignores the keys graphql-codegen merges into every config', async () => {
		const config = { emitLegacyCommonJSImports: true, importExtension: '' };
		const output = await api.plugin(buildSchema(FIXTURE_SDL), [], config);
		expect(output).toContain('graphql: LimixGraphql;');
		expect(output).toContain('// Do not edit: run graphql-codegen again.');
	});

	it('refuses a wrong value of rules or openapi', async () => {
		const schema = buildSchema(FIXTURE_SDL);
		await expect(
			// @ts-expect-error openapi is a file or a list of files
			api.plugin(schema, [], { openapi: 3 }),
		).rejects.toThrow('`openapi` must be a file or a list of files');
		await expect(
			// @ts-expect-error rules is a file
			api.plugin(schema, [], { rules: 3 }),
		).rejects.toThrow('`rules` must be a file');
	});

	it('names two copies of graphql', async () => {
		await expect(
			// @ts-expect-error not a GraphQLSchema of this graphql
			api.plugin({ getTypeMap: () => ({}) }, [], {}),
		).rejects.toThrow('two copies of graphql');
	});
});
