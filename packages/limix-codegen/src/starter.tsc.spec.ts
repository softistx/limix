import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';
import { FIXTURE_INPUT } from './codegen.fixtures';
import { generateModule } from './module';
import { starterPolicy } from './starter';

const root = new URL('../', import.meta.url).pathname;
const tsc = new URL('../../../node_modules/.bin/tsc', import.meta.url).pathname;

const operations = [
	...(FIXTURE_INPUT.rest ?? []),
	...(FIXTURE_INPUT.graphql ?? []),
];

/** Type-checks a project of the generated file, a hand vocabulary and a policy. */
async function check(policy: string) {
	const dir = await mkdtemp(join(root, '.starter-tsc-'));
	try {
		await Bun.write(
			join(dir, 'generated', 'limix.ts'),
			generateModule(FIXTURE_INPUT),
		);
		await Bun.write(
			join(dir, 'vocabulary.ts'),
			`declare module '@softistx/limix' {
	interface Register {
		role: 'admin';
		permission: 'notes:write';
	}
}
export {};
`,
		);
		await Bun.write(join(dir, 'policy.ts'), policy);
		await Bun.write(
			join(dir, 'tsconfig.json'),
			JSON.stringify({
				extends: '../../../tsconfig.base.json',
				compilerOptions: { noEmit: true, rootDirs: ['.'] },
				include: ['**/*.ts'],
			}),
		);
		const result = await $`${tsc} -p ${dir}/tsconfig.json`.quiet().nothrow();
		return { code: result.exitCode, out: result.stdout.toString() };
	} finally {
		await rm(dir, { recursive: true });
	}
}

describe('the policy init writes, against the file generate writes', () => {
	for (const flat of [false, true]) {
		const name = flat ? 'flat' : 'nested';

		it(`type-checks, ${name}`, async () => {
			const result = await check(starterPolicy(operations, { flat }));
			expect(result.out).toBe('');
			expect(result.code).toBe(0);
		}, 60_000);

		it(`refuses an operation the API does not have, ${name}`, async () => {
			const text = starterPolicy(operations, { flat }).replace(
				'/notes/:id',
				'/notes/:uid',
			);
			const result = await check(text);
			expect(result.code).not.toBe(0);
			expect(result.out).toContain('policy.ts');
		}, 60_000);

		it(`narrows the terms to the declared names, ${name}`, async () => {
			const ok = starterPolicy(operations, { flat }).replace(
				'authenticated: true',
				"roles: [['admin']], permissions: [['notes:write']]",
			);
			expect((await check(ok)).code).toBe(0);
			const bad = ok.replace("'admin'", "'root'");
			const result = await check(bad);
			expect(result.code).not.toBe(0);
			expect(result.out).toContain('"root"');
		}, 60_000);
	}
});
