import { RulesError } from '@softistx/limix';
import { CodegenError } from '../errors';
import { generateCommand } from './generate';
import { GENERATE_HELP, INIT_HELP, MAIN_HELP } from './help';
import { initCommand } from './init';
import { type Io, UsageError } from './io';

const COMMANDS = {
	generate: { help: GENERATE_HELP, run: generateCommand },
	init: { help: INIT_HELP, run: initCommand },
} as const;

/** `node:util` parseArgs refusals carry an `ERR_PARSE_ARGS_*` code. */
const hasCode = (error: unknown): error is { code: unknown } =>
	typeof error === 'object' && error !== null && 'code' in error;

function isParseError(error: unknown): boolean {
	return (
		hasCode(error) &&
		typeof error.code === 'string' &&
		error.code.startsWith('ERR_PARSE_ARGS')
	);
}

const isCommand = (name: string): name is keyof typeof COMMANDS =>
	Object.hasOwn(COMMANDS, name);

/**
 * The whole command line, testable without a process: returns the exit code
 * (0 done, 1 refused, 2 wrong command line) and writes through `io`.
 */
export async function run(argv: readonly string[], io: Io): Promise<number> {
	const [first, ...rest] = argv;
	if (first === undefined) {
		io.stderr(MAIN_HELP);
		return 2;
	}
	if (first === '--help' || first === '-h') {
		io.stdout(MAIN_HELP);
		return 0;
	}
	if (!isCommand(first)) {
		io.stderr(`unknown command "${first}"\n\n${MAIN_HELP}`);
		return 2;
	}
	const command = COMMANDS[first];
	try {
		return await command.run(rest, io);
	} catch (error) {
		if (
			error instanceof Error &&
			(error instanceof UsageError || isParseError(error))
		) {
			io.stderr(`${error.message}\n\n${command.help}`);
			return 2;
		}
		if (error instanceof CodegenError || error instanceof RulesError) {
			io.stderr(`${error.message}\n`);
			return 1;
		}
		// A file that cannot be read or written: ENOENT, EISDIR, EACCES...
		if (
			error instanceof Error &&
			hasCode(error) &&
			typeof error.code === 'string'
		) {
			io.stderr(`${error.message}\n`);
			return 1;
		}
		throw error;
	}
}
