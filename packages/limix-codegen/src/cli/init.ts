import { dirname, relative } from 'node:path';
import { starterPolicy } from '../starter';
import { INIT_HELP } from './help';
import { loadInputs, parseInputs } from './inputs';
import { type Io, UsageError } from './io';

const DEFAULT_OUT = 'src/policy.ts';
const DEFAULT_TYPES = 'src/generated/limix.ts';

/** The import specifier of the types file as the policy file writes it. */
function specifier(out: string, types: string): string {
	const path = relative(dirname(out), types)
		.split('\\')
		.join('/')
		.replace(/\.ts$/, '');
	return path.startsWith('.') ? path : `./${path}`;
}

/** `limix-codegen init`: a starter `policy.ts`, written once. */
export async function initCommand(
	argv: readonly string[],
	io: Io,
): Promise<number> {
	const { values } = parseInputs(argv, {
		flat: { type: 'boolean' },
		out: { type: 'string' },
		types: { type: 'string' },
	});
	if (values.help) {
		io.stdout(INIT_HELP);
		return 0;
	}
	if (!values.graphql?.length && !values.openapi?.length) {
		throw new UsageError('give at least one of --graphql, --openapi');
	}
	const out = values.out ?? DEFAULT_OUT;
	if (!out.toLowerCase().endsWith('.ts')) {
		throw new UsageError(`${out}: the policy is TypeScript, use a .ts file`);
	}
	if (await io.exists(out)) {
		io.stderr(
			`${out} exists: init never rewrites a policy; new operations show up as uncovered in coverage\n`,
		);
		return 0;
	}
	const input = await loadInputs(
		{ graphql: values.graphql, openapi: values.openapi },
		io,
	);
	const operations = [...(input.rest ?? []), ...(input.graphql ?? [])];
	await io.writeFile(
		out,
		starterPolicy(operations, {
			flat: values.flat === true,
			types: specifier(out, values.types ?? DEFAULT_TYPES),
		}),
	);
	io.stdout(
		`wrote ${out} (${operations.length} operations, unmatched: deny)\n`,
	);
	return 0;
}
