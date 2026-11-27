import { describe, expect, it } from 'bun:test';
import { $ } from 'bun';

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
});
