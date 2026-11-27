/** What the commands touch outside the process, so a spec can stand in. */
export interface Io {
	stdout(text: string): void;
	stderr(text: string): void;
	/** `-` reads standard input. */
	readFile(path: string): Promise<string>;
	writeFile(path: string, text: string): Promise<void>;
}

/** The real thing: the process streams and the file system, through Bun. */
export const processIo: Io = {
	stdout: (text) => {
		process.stdout.write(text);
	},
	stderr: (text) => {
		process.stderr.write(text);
	},
	readFile: (path) => (path === '-' ? Bun.stdin.text() : Bun.file(path).text()),
	writeFile: async (path, text) => {
		await Bun.write(path, text);
	},
};

/** A wrong command line: usage on stderr and exit code 2. */
export class UsageError extends Error {
	override readonly name = 'UsageError';
}
