import { describe, expect, it } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { rulesJsonSchema, rulesJsonSchemaText } from './generate-schema';

const committed = new URL('../../schema/rules.schema.json', import.meta.url);

describe('schema/rules.schema.json', () => {
	it('is the one generated from the zod schemas (run `bun run schema:gen` after a change)', async () => {
		const onDisk = JSON.parse(await readFile(committed, 'utf8'));
		expect(onDisk).toEqual(JSON.parse(rulesJsonSchemaText()));
	});

	it('requires limix and global.unmatched and accepts x- keys', () => {
		const schema = rulesJsonSchema() as {
			required: string[];
			patternProperties: object;
			properties: { global: { required: string[] } };
		};
		expect(schema.required).toEqual(
			expect.arrayContaining(['limix', 'global']),
		);
		expect(schema.properties.global.required).toEqual(['unmatched']);
		expect(schema.patternProperties).toEqual({ '^x-': {} });
	});

	it('mentions no removed key', () => {
		const text = rulesJsonSchemaText();
		for (const removed of [
			'"keto"',
			'"expression"',
			'"authorities"',
			'"cors"',
			'"rateLimit"',
			'"providers"',
			'"namespace"',
		]) {
			expect(text).not.toContain(removed);
		}
	});
});
