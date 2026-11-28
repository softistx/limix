import { describe, expect, it } from 'bun:test';
import { $ } from 'bun';
import { GENERATE_HELP, INIT_HELP, MAIN_HELP } from './help';

const main = new URL('./main.ts', import.meta.url).pathname;

describe('the limix-codegen bin', () => {
	it('answers --help with exit 0', async () => {
		const result = await $`bun ${main} --help`.quiet().nothrow();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain('Usage: limix-codegen');
	});

	it('answers an unknown command with exit 2 and usage on stderr', async () => {
		const result = await $`bun ${main} nope`.quiet().nothrow();
		expect(result.exitCode).toBe(2);
		expect(result.stderr.toString()).toContain('unknown command "nope"');
	});

	it('documents the exit codes, --check, --flat and --out, and no rules file', () => {
		expect(MAIN_HELP).toContain('missing or out of date');
		expect(GENERATE_HELP).toContain('--check');
		expect(GENERATE_HELP).toContain('never reads a policy');
		expect(INIT_HELP).toContain('--flat');
		expect(INIT_HELP).toContain("'GET /notes', 'Query.me'");
		expect(INIT_HELP).toContain('--out <file>');
		for (const help of [MAIN_HELP, GENERATE_HELP, INIT_HELP]) {
			expect(help).not.toContain('--rules');
			expect(help).not.toContain('stale');
		}
	});

	it('answers init --help with --flat on stdout', async () => {
		const result = await $`bun ${main} init --help`.quiet().nothrow();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe(INIT_HELP);
	});
});
