/** What the commands touch outside the process, so a spec can stand in. */
export interface Io {
	stdout(text: string): void;
	stderr(text: string): void;
	readFile(path: string): Promise<string>;
	/** Creates the parent folders. */
	writeFile(path: string, text: string): Promise<void>;
	exists(path: string): Promise<boolean>;
}

/** The real thing: the process streams and the file system, through Bun. */
export const processIo: Io = {
	stdout: (text) => {
		process.stdout.write(text);
	},
	stderr: (text) => {
		process.stderr.write(text);
	},
	readFile: (path) => Bun.file(path).text(),
	writeFile: async (path, text) => {
		await Bun.write(path, text);
	},
	exists: (path) => Bun.file(path).exists(),
};

/** A wrong command line: usage on stderr and exit code 2. */
export class UsageError extends Error {
	override readonly name = 'UsageError';
}
