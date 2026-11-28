import { graphqlOperations } from '@softistx/limix-graxia/operations';
import { GraphQLSchema } from 'graphql';
import { processIo } from '../cli/io';
import { CodegenError } from '../errors';
import { generateModule, sourceNames } from '../module';
import { bunOnly, readOpenapi } from '../sources';

/**
 * The plugin's config in `codegen.ts`. graphql-codegen merges its own keys
 * (`emitLegacyCommonJSImports`, `importExtension`...) into every plugin's
 * config: any other key is ignored.
 */
export interface LimixCodegenPluginConfig {
	[other: string]: unknown;
	/** One or several OpenAPI files: their REST operations are registered. */
	openapi?: string | string[];
}

function openapiFiles(value: unknown): string[] {
	if (value === undefined) return [];
	if (typeof value === 'string') return [value];
	if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
		return value;
	}
	throw new CodegenError(
		'limix plugin: `openapi` must be a file or a list of files',
	);
}

/**
 * The graphql-codegen plugin: registers the operations of the schema, the
 * REST operations of the OpenAPI files. It reads files through Bun when
 * `openapi` is given, so start it with
 * `bun --bun graphql-codegen`, and it needs the one copy of `graphql`
 * graphql-codegen itself uses.
 */
export const plugin = async (
	schema: GraphQLSchema,
	_documents: unknown,
	config: LimixCodegenPluginConfig,
): Promise<string> => {
	if (!(schema instanceof GraphQLSchema)) {
		throw new CodegenError(
			"two copies of graphql: the schema is not an instance of this package's graphql; keep one copy (bun pm ls graphql, then dedupe it in the lockfile)",
		);
	}
	const openapi = openapiFiles(config?.openapi);
	if (openapi.length) bunOnly('the limix graphql-codegen plugin');
	const rest = (
		await Promise.all(openapi.map((path) => readOpenapi(path, processIo)))
	).flat();
	return generateModule({
		sources: ['the GraphQL schema', ...sourceNames(openapi)],
		regenerate: 'run graphql-codegen again',
		graphql: graphqlOperations(schema, { fields: 'all' }),
		...(openapi.length ? { rest } : {}),
	});
};
