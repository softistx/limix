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

	it('documents the stale check, the exit codes and --flat', () => {
		expect(MAIN_HELP).toContain('or a stale rule');
		expect(GENERATE_HELP).toContain('or a rule is stale');
		expect(GENERATE_HELP).toContain('judged against the');
		expect(INIT_HELP).toContain('--flat');
		expect(INIT_HELP).toContain('"GET /notes", "Query.me"');
	});

	it('answers init --help with --flat on stdout', async () => {
		const result = await $`bun ${main} init --help`.quiet().nothrow();
		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toBe(INIT_HELP);
	});
});
