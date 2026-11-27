import type { Rules } from '@softistx/limix';
import { loadRules } from '@softistx/limix/bun';
import type { GraphqlOperation, RestOperation } from '@softistx/limix/coverage';
import type { Io } from './cli/io';
import { CodegenError } from './errors';
import { openapiOperations } from './openapi';

/** Throws unless running on Bun: the rules and OpenAPI readers use `Bun.file` and `Bun.YAML`. */
export function bunOnly(who: string): void {
	if (typeof globalThis.Bun === 'undefined') {
		throw new CodegenError(
			`${who} runs on Bun: start it with bun --bun graphql-codegen`,
		);
	}
}

/** The REST operations of an OpenAPI file (`.yaml`, `.yml` or `.json`). */
export async function readOpenapi(
	path: string,
	io: Pick<Io, 'readFile'>,
): Promise<RestOperation[]> {
	const lower = path.toLowerCase();
	const json = lower.endsWith('.json');
	if (!json && !lower.endsWith('.yaml') && !lower.endsWith('.yml')) {
		throw new CodegenError(`${path}: use .yaml, .yml or .json`);
	}
	const text = await io.readFile(path);
	let document: unknown;
	try {
		document = json ? JSON.parse(text) : Bun.YAML.parse(text);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new CodegenError(`${path}: not readable: ${reason}`);
	}
	return openapiOperations(document, path);
}

const MISSING_PEER =
	'--graphql needs @softistx/limix-graxia and graphql: bun add -d @softistx/limix-graxia graphql';

function isModuleNotFound(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return (
		code === 'ERR_MODULE_NOT_FOUND' ||
		(error instanceof Error &&
			/Cannot find (module|package)/.test(error.message))
	);
}

/** Every operation (roots and other types) of the SDL files, read without graxia. */
export async function readGraphql(
	paths: readonly string[],
	io: Pick<Io, 'readFile'>,
): Promise<GraphqlOperation[]> {
	const texts = await Promise.all(paths.map((path) => io.readFile(path)));
	let operations: typeof import('@softistx/limix-graxia/operations');
	try {
		operations = await import('@softistx/limix-graxia/operations');
	} catch (error) {
		if (isModuleNotFound(error)) throw new CodegenError(MISSING_PEER);
		throw error;
	}
	return operations.graphqlOperations(texts.join('\n'), { fields: 'all' });
}

/** The rules file, validated: YAML or JSON, through `loadRules`. */
export function readRules(path: string): Promise<Rules> {
	bunOnly('limix-codegen');
	return loadRules(path);
}
