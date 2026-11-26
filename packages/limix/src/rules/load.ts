import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { RulesError } from './error';
import { parseRules } from './parse';
import type { Rules } from './schema';

/**
 * Reads a rules file (`.yaml`, `.yml` or `.json`, by extension) and validates
 * it. Throws a `RulesError` for a document that is not valid, and for a file
 * that does not parse or has another extension.
 */
export async function loadRules(path: string): Promise<Rules> {
	const extension = extname(path).toLowerCase();
	if (!['.yaml', '.yml', '.json'].includes(extension)) {
		throw new RulesError(
			[
				{
					path: '',
					message: `unsupported extension \`${extension}\`: use .yaml, .yml or .json`,
				},
			],
			path,
		);
	}
	const text = await readFile(path, 'utf8');
	let data: unknown;
	try {
		data = extension === '.json' ? JSON.parse(text) : parseYaml(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new RulesError(
			[{ path: '', message: `not readable: ${reason}` }],
			path,
		);
	}
	return parseRules(data, path);
}
