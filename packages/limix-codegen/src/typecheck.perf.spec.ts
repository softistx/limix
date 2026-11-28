import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const root = new URL('../', import.meta.url).pathname;
const tsc = new URL('../../../node_modules/.bin/tsc', import.meta.url).pathname;

/** A program registering `routes` REST operations and a `definePolicy` over 50 paths. */
function program(routes: number, flat: boolean): string {
	const paths = Array.from({ length: routes / 4 }, (_, i) => `/r${i}/:id`);
	const methods = ['GET', 'POST', 'PUT', 'DELETE'];
	const union = paths
		.flatMap((p) => methods.map((m) => `\t| '${m} ${p}'`))
		.join('\n');
	const used = paths.slice(0, 50);
	const entries = flat
		? used.map((p) => `'GET ${p}': rule, 'POST ${p}': rule,`)
		: used.map((p) => `'${p}': { GET: rule, POST: rule },`);
	return `import { definePolicy } from '@softistx/limix';
export type LimixRest =
${union};
declare module '@softistx/limix' {
	interface Register {
		rest: LimixRest;
	}
}
const rule = { authenticated: true } as const;
export const rules = definePolicy({ limix: 1, global: { unmatched: 'deny' }, rest: {
${entries.join('\n')}
} });
`;
}

/** The instantiations tsc reports for one program: deterministic, unlike a duration. */
async function instantiations(source: string): Promise<number> {
	const dir = await mkdtemp(join(root, '.perf-'));
	try {
		await Bun.write(join(dir, 'case.ts'), source);
		await Bun.write(
			join(dir, 'tsconfig.json'),
			JSON.stringify({
				extends: '../../../tsconfig.base.json',
				compilerOptions: { noEmit: true, rootDirs: ['.'] },
				include: ['case.ts'],
			}),
		);
		const result = await $`${tsc} -p ${dir}/tsconfig.json --extendedDiagnostics`
			.quiet()
			.nothrow();
		const out = result.stdout.toString();
		expect(result.exitCode, out).toBe(0);
		return Number(/Instantiations:\s+(\d+)/.exec(out)?.[1]);
	} finally {
		await rm(dir, { recursive: true });
	}
}

// Measured at the time of writing, 2000 operations: nested 715k (the same as
// before flat keys; the nested lookup is quadratic), flat 12k. The budgets
// leave room for a TypeScript release and catch a blow-up, not a drift.
describe('definePolicy over a registered API of 2000 operations', () => {
	it('type-checks the nested form within budget', async () => {
		expect(await instantiations(program(2000, false))).toBeLessThan(1_500_000);
	}, 60_000);

	it('type-checks the flat form within budget', async () => {
		expect(await instantiations(program(2000, true))).toBeLessThan(100_000);
	}, 60_000);
});
