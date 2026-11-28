import { resolve } from 'node:path';
import { generateModule } from '../module';
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
	if (!values.graphql?.length && !values.openapi?.length) {
		throw new UsageError('give at least one of --graphql, --openapi');
	}
	const out = values.out ?? DEFAULT_OUT;
	const target = resolve(out);
	const inputs = [...(values.graphql ?? []), ...(values.openapi ?? [])];
	if (inputs.some((input) => resolve(input) === target)) {
		throw new UsageError(
			`--out ${out} is also an input: it would be overwritten`,
		);
	}
	const loaded = await loadInputs(values, io);
	const wanted = generateModule(loaded);
	const present = await io.exists(out);
	const current = present ? lf(await io.readFile(out)) : undefined;
	const same = current === lf(wanted);
	if (values.check) {
		if (!same) {
			const why = present ? 'is out of date' : 'is missing';
			io.stderr(
				`${out} ${why}: run limix-codegen generate with the same flags and commit it\n`,
			);
		} else io.stdout(`${out} is up to date\n`);
		return same ? 0 : 1;
	}
	if (same) io.stdout(`${out} is up to date\n`);
	else {
		await io.writeFile(out, wanted);
		io.stdout(`wrote ${out}\n`);
	}
	return 0;
}
