import { RulesError } from '@softistx/limix';
import { PublishError } from '../index';
import { checkCommand } from './check';
import { CHECK_HELP, JWKS_HELP, MAIN_HELP, SIGN_HELP } from './help';
import { type Io, UsageError } from './io';
import { jwksCommand } from './jwks';
import { signCommand } from './sign';

const COMMANDS = {
	sign: { help: SIGN_HELP },
	jwks: { help: JWKS_HELP },
	check: { help: CHECK_HELP },
} as const;

/** `node:util` parseArgs refusals carry an `ERR_PARSE_ARGS_*` code. */
function isParseError(error: unknown): boolean {
	const code = (error as { code?: unknown } | null)?.code;
	return typeof code === 'string' && code.startsWith('ERR_PARSE_ARGS');
}

/**
 * The whole command line, testable without a process: returns the exit code
 * (0 done, 1 refused, 2 wrong command line) and writes through `io`.
 */
export async function run(
	argv: readonly string[],
	io: Io,
	now: () => number = Date.now,
): Promise<number> {
	const [first, ...rest] = argv;
	if (first === undefined) {
		io.stderr(MAIN_HELP);
		return 2;
	}
	if (first === '--help' || first === '-h') {
		io.stdout(MAIN_HELP);
		return 0;
	}
	if (!Object.hasOwn(COMMANDS, first)) {
		io.stderr(`unknown command "${first}"\n\n${MAIN_HELP}`);
		return 2;
	}
	const name = first as keyof typeof COMMANDS;
	try {
		if (name === 'sign') return await signCommand(rest, io);
		if (name === 'jwks') return await jwksCommand(rest, io);
		return await checkCommand(rest, io, now);
	} catch (error) {
		if (error instanceof UsageError || isParseError(error)) {
			io.stderr(`${(error as Error).message}\n\n${COMMANDS[name].help}`);
			return 2;
		}
		if (error instanceof RulesError || error instanceof PublishError) {
			io.stderr(`${error.message}\n`);
			return 1;
		}
		// A file that cannot be read or written: ENOENT, EISDIR, EACCES...
		if (typeof (error as { code?: unknown } | null)?.code === 'string') {
			io.stderr(`${(error as Error).message}\n`);
			return 1;
		}
		throw error;
	}
}
