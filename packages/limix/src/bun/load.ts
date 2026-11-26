import { extname } from 'node:path';
import { RulesError } from '../rules/error';
import { parseRules } from '../rules/parse';
import type { Rules } from '../rules/schema';

/**
 * Reads a rules file (`.yaml`, `.yml` or `.json`, by extension) and validates
 * it, with `Bun.file` and `Bun.YAML`: Bun only. Throws a `RulesError` for a
 * document that is not valid, and for a file that does not parse or has
 * another extension. A file that is missing or unreadable throws the raw
 * system error (`ENOENT`, `EACCES`), not a `RulesError`.
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
	const text = await Bun.file(path).text();
	let data: unknown;
	try {
		data = extension === '.json' ? JSON.parse(text) : Bun.YAML.parse(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new RulesError(
			[{ path: '', message: `not readable: ${reason}` }],
			path,
		);
	}
	return parseRules(data, path);
}
