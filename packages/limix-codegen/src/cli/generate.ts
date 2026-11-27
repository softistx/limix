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
	if (!values.graphql?.length && !values.openapi?.length && !values.rules) {
		throw new UsageError('give at least one of --graphql, --openapi, --rules');
	}
	const out = values.out ?? DEFAULT_OUT;
	const wanted = generateModule(await loadInputs(values, io));
	const present = await io.exists(out);
	const current = present ? lf(await io.readFile(out)) : undefined;
	const same = current === lf(wanted);
	if (values.check) {
		if (same) {
			io.stdout(`${out} is up to date\n`);
			return 0;
		}
		const why = present ? 'is out of date' : 'is missing';
		io.stderr(
			`${out} ${why}: run limix-codegen generate with the same flags and commit it\n`,
		);
		return 1;
	}
	if (same) {
		io.stdout(`${out} is up to date\n`);
		return 0;
	}
	await io.writeFile(out, wanted);
	io.stdout(`wrote ${out}\n`);
	return 0;
}
