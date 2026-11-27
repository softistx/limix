import type { RestOperation } from '@softistx/limix/coverage';
import { CodegenError } from './errors';

const OPENAPI_METHODS: Readonly<Record<string, string>> = {
	get: 'GET',
	put: 'PUT',
	post: 'POST',
	delete: 'DELETE',
	options: 'OPTIONS',
	head: 'HEAD',
	patch: 'PATCH',
	trace: 'TRACE',
	query: 'QUERY',
};

const IDENTIFIER = /^[$_\p{ID_Start}][$\p{ID_Continue}‌‍]*$/u;
const ID_CONTINUE = /^(?:[$\p{ID_Continue}]|‌|‍)$/u;
const SYNTAX = new Set(['\\', '(', ')', '[', ']', '+', '?', '!', ':', '*']);

/**
 * An OpenAPI path in the spelling of a rules file: `/notes/{id}` becomes
 * `/notes/:id`. A name that is no identifier, or that runs into the text after
 * it (`{id}x`), is quoted (`:"id"x`); characters the pattern syntax owns are
 * escaped.
 */
export function openapiPath(path: string): string {
	const chars = Array.from(path);
	let out = '';
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] as string;
		if (char === '}') throw new CodegenError(`unbalanced } in path ${path}`);
		if (char === '{') {
			const end = chars.indexOf('}', i);
			if (end === -1) throw new CodegenError(`unbalanced { in path ${path}`);
			const name = chars.slice(i + 1, end).join('');
			if (name === '') throw new CodegenError(`empty {} in path ${path}`);
			const next = chars[end + 1];
			const bare = IDENTIFIER.test(name) && !(next && ID_CONTINUE.test(next));
			out += bare ? `:${name}` : `:"${name.replace(/[\\"]/g, '\\$&')}"`;
			i = end;
		} else out += SYNTAX.has(char) ? `\\${char}` : char;
	}
	return out;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The REST operations of an OpenAPI 3.x or Swagger 2.0 document, in document
 * order, with their paths in rules-file spelling. Servers and `basePath` are
 * ignored: keys are written without `global.basePath`.
 */
export function openapiOperations(
	document: unknown,
	source = 'the OpenAPI document',
): RestOperation[] {
	if (!isObject(document) || !isObject(document['paths'])) {
		throw new CodegenError(
			`${source}: not an OpenAPI document: \`paths\` must be an object`,
		);
	}
	const operations: RestOperation[] = [];
	for (const [path, item] of Object.entries(document['paths'])) {
		if (!path.startsWith('/')) {
			throw new CodegenError(`${source}: path ${path} must start with /`);
		}
		if (!isObject(item)) {
			throw new CodegenError(`${source}: path item ${path} must be an object`);
		}
		if ('$ref' in item) {
			throw new CodegenError(
				`${source}: path item ${path} is a $ref: bundle the spec first (one file, path items inline)`,
			);
		}
		for (const [key, value] of Object.entries(item)) {
			const method = Object.hasOwn(OPENAPI_METHODS, key)
				? OPENAPI_METHODS[key]
				: undefined;
			if (method && isObject(value)) {
				operations.push({ kind: 'rest', method, path: openapiPath(path) });
			}
		}
	}
	return operations;
}
