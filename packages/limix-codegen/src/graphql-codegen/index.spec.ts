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
import { generateModule } from '../module';
import * as api from './index';

describe('the graphql-codegen plugin', () => {
	it('exports plugin alone', () => {
		expect(Object.keys(api)).toEqual(['plugin']);
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
					sources: ['the GraphQL schema', openapi, rules],
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

	it('refuses an unknown key and a wrong openapi value', async () => {
		const schema = buildSchema(FIXTURE_SDL);
		await expect(api.plugin(schema, [], { nope: 1 } as never)).rejects.toThrow(
			'limix plugin: unknown config key nope (rules, openapi)',
		);
		await expect(
			api.plugin(schema, [], { openapi: 3 } as never),
		).rejects.toThrow('`openapi` must be a file or a list of files');
	});
});
