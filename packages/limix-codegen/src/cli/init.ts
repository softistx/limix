import { starterRules } from '../starter';
import { INIT_HELP } from './help';
import { loadInputs, parseInputs } from './inputs';
import { type Io, UsageError } from './io';

const DEFAULT_RULES = 'rules.yaml';

/** `limix-codegen init`: a starter rules file, written once. */
export async function initCommand(
	argv: readonly string[],
	io: Io,
): Promise<number> {
	const { values } = parseInputs(argv, { flat: { type: 'boolean' } });
	if (values.help) {
		io.stdout(INIT_HELP);
		return 0;
	}
	if (!values.graphql?.length && !values.openapi?.length) {
		throw new UsageError('give at least one of --graphql, --openapi');
	}
	const target = values.rules ?? DEFAULT_RULES;
	const lower = target.toLowerCase();
	const format = lower.endsWith('.json')
		? 'json'
		: lower.endsWith('.yaml') || lower.endsWith('.yml')
			? 'yaml'
			: undefined;
	if (!format) throw new UsageError(`${target}: use .yaml, .yml or .json`);
	if (await io.exists(target)) {
		io.stderr(
			`${target} exists: init never rewrites a rules file; new operations show up as uncovered in coverage\n`,
		);
		return 0;
	}
	const input = await loadInputs(
		{ graphql: values.graphql, openapi: values.openapi },
		io,
		{ rules: false },
	);
	const operations = [...(input.rest ?? []), ...(input.graphql ?? [])];
	await io.writeFile(
		target,
		starterRules(operations, format, { flat: values.flat === true }),
	);
	io.stdout(
		`wrote ${target} (${operations.length} operations, unmatched: deny)\n`,
	);
	return 0;
}
