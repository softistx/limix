import { compilePolicy, parseRules } from '@softistx/limix';
import { type RestOperation, rulesPathOf } from '@softistx/limix/coverage';
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

/** The limix spelling of a path, proved by compiling it as a one-route policy. */
function converted(path: string, source: string): string {
	let pattern: string;
	try {
		pattern = rulesPathOf(path);
	} catch (error) {
		if (error instanceof TypeError) {
			throw new CodegenError(`${source}: ${error.message}`);
		}
		throw error;
	}
	try {
		compilePolicy(
			parseRules({
				limix: 1,
				global: { unmatched: 'deny' },
				rest: { [pattern]: { GET: { authenticated: true } } },
			}),
		);
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		throw new CodegenError(
			`${source}: path ${path} cannot be a limix pattern: ${reason}`,
		);
	}
	return pattern;
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
				operations.push({
					kind: 'rest',
					method,
					path: converted(path, source),
				});
			}
		}
	}
	return operations;
}
