import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

const root = new URL('../../', import.meta.url).pathname;
const tsc = new URL('../../../../node_modules/.bin/tsc', import.meta.url)
	.pathname;

/**
 * A program registering `routes` REST operations, 20 roles, 50 permissions and
 * 10 conditions, and a `definePolicy` over 50 paths whose bodies name them. It
 * imports the built package, as an application does: run `bun run build` first.
 */
function program(routes: number, flat: boolean): string {
	const paths = Array.from({ length: routes / 4 }, (_, i) => `/r${i}/:id`);
	const methods = ['GET', 'POST', 'PUT', 'DELETE'];
	const union = paths
		.flatMap((p) => methods.map((m) => `\t| '${m} ${p}'`))
		.join('\n');
	const names = (prefix: string, count: number) =>
		Array.from({ length: count }, (_, i) => `'${prefix}${i}'`).join(' | ');
	const used = paths.slice(0, 50);
	const body =
		"{ roles: [['role1'], ['role2', 'role3']], permissions: [['perm1', 'perm2']], when: ['cond1'] }";
	const entries = flat
		? used.map((p) => `'GET ${p}': ${body}, 'POST ${p}': ${body},`)
		: used.map((p) => `'${p}': { GET: ${body}, POST: ${body} },`);
	return `import { definePolicy } from '@softistx/limix';
export type LimixRest =
${union};
declare module '@softistx/limix' {
	interface Register {
		rest: LimixRest;
		role: ${names('role', 20)};
		permission: ${names('perm', 50)};
		condition: ${names('cond', 10)};
	}
}
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

// 2000 operations with narrowed role, permission and condition names. The
// budgets leave room for a TypeScript release and catch a blow-up, not a drift.
describe('definePolicy over a registered API of 2000 operations, bodies narrowed', () => {
	it('type-checks the nested form within budget', async () => {
		const count = await instantiations(program(2000, false));
		expect(count).toBeLessThan(1_500_000);
	}, 60_000);

	it('type-checks the flat form within budget', async () => {
		const count = await instantiations(program(2000, true));
		expect(count).toBeLessThan(100_000);
	}, 60_000);
});
