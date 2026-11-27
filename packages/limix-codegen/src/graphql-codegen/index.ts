import { graphqlOperations } from '@softistx/limix-graxia/operations';
import type { GraphQLSchema } from 'graphql';
import { processIo } from '../cli/io';
import { CodegenError } from '../errors';
import { generateModule } from '../module';
import { bunOnly, readOpenapi, readRules } from '../sources';

/** The plugin's config in `codegen.ts`. */
export interface LimixCodegenPluginConfig {
	/** The rules file (YAML or JSON): its permission, role and condition names are registered. */
	rules?: string;
	/** One or several OpenAPI files: their REST operations are registered. */
	openapi?: string | string[];
}

const KEYS = ['rules', 'openapi'];

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
 * REST operations of the OpenAPI files and the names of the rules file. It runs
 * on Bun (`bun --bun graphql-codegen`), and needs the one copy of `graphql`
 * graphql-codegen itself uses.
 */
export const plugin = async (
	schema: GraphQLSchema,
	_documents: unknown,
	config: LimixCodegenPluginConfig,
): Promise<string> => {
	bunOnly('the limix graphql-codegen plugin');
	for (const key of Object.keys(config ?? {})) {
		if (!KEYS.includes(key)) {
			throw new CodegenError(
				`limix plugin: unknown config key ${key} (rules, openapi)`,
			);
		}
	}
	const openapi = openapiFiles(config?.openapi);
	const rest = (
		await Promise.all(openapi.map((path) => readOpenapi(path, processIo)))
	).flat();
	const rules = config?.rules ? await readRules(config.rules) : undefined;
	return generateModule({
		sources: [
			'the GraphQL schema',
			...openapi,
			...(config?.rules ? [config.rules] : []),
		],
		graphql: graphqlOperations(schema, { fields: 'all' }),
		...(openapi.length ? { rest } : {}),
		...(rules ? { rules } : {}),
	});
};
