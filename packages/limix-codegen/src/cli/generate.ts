import { resolve } from 'node:path';
import { generateModule } from '../module';
import { staleRules } from '../stale';
import { GENERATE_HELP } from './help';
import { loadInputs, parseInputs } from './inputs';
import { type Io, UsageError } from './io';

const DEFAULT_OUT = 'src/generated/limix.ts';
const lf = (text: string) => text.replace(/\r\n/g, '\n');

/** `limix-codegen generate`: writes the module, or with `--check` compares it. */
export async function generateCommand(
	argv: readonly string[],
	io: Io,
): Promise<number> {
	const { values } = parseInputs(argv, {
		out: { type: 'string' },
		check: { type: 'boolean' },
	});
	if (values.help) {
		io.stdout(GENERATE_HELP);
		return 0;
	}
	if (!values.graphql?.length && !values.openapi?.length && !values.rules) {
		throw new UsageError('give at least one of --graphql, --openapi, --rules');
	}
	const out = values.out ?? DEFAULT_OUT;
	const target = resolve(out);
	const inputs = [...(values.graphql ?? []), ...(values.openapi ?? [])];
	if (values.rules) inputs.push(values.rules);
	if (inputs.some((input) => resolve(input) === target)) {
		throw new UsageError(
			`--out ${out} is also an input: it would be overwritten`,
		);
	}
	const loaded = await loadInputs(values, io);
	const wanted = generateModule(loaded);
	// Rules are judged against the operations given, so both must be there.
	const stale =
		loaded.rules && (loaded.rest || loaded.graphql)
			? staleRules(loaded.rules, {
					rest: loaded.rest,
					graphql: loaded.graphql,
					sources: {
						rules: values.rules ?? '',
						openapi: (values.openapi ?? []).join(', '),
						graphql: (values.graphql ?? []).join(', '),
					},
				})
			: [];
	const report = () => {
		for (const issue of stale) io.stderr(`${issue.message}\n`);
	};
	const present = await io.exists(out);
	const current = present ? lf(await io.readFile(out)) : undefined;
	const same = current === lf(wanted);
	if (values.check) {
		if (!same) {
			const why = present ? 'is out of date' : 'is missing';
			io.stderr(
				`${out} ${why}: run limix-codegen generate with the same flags and commit it\n`,
			);
		}
		report();
		if (stale.length > 0) {
			io.stderr(
				`${stale.length} stale rule(s): fix or remove them, or add the operation to the spec\n`,
			);
		}
		if (same && stale.length === 0) io.stdout(`${out} is up to date\n`);
		return same && stale.length === 0 ? 0 : 1;
	}
	if (same) io.stdout(`${out} is up to date\n`);
	else {
		await io.writeFile(out, wanted);
		io.stdout(`wrote ${out}\n`);
	}
	report();
	return 0;
}
