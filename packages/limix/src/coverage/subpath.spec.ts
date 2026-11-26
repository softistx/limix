import { describe, expect, it } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * `@softistx/limix/coverage` runs in a browser or an edge runtime, so nothing
 * it imports may reach for Node or Bun. Checked on the source graph the build
 * compiles: every relative import is followed from the entry and every bare
 * import named.
 */
const ENTRY = resolve(import.meta.dir, 'index.ts');
const MAIN = resolve(import.meta.dir, '../index.ts');
const IMPORT = /(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g;
/** `import type` is erased by the build and pulls in no runtime code. */
const TYPE_IMPORT = /import\s+type\s[^;]*?from\s*['"][^'"]+['"];?/g;

const runtimeImports = (text: string) =>
	[...text.replace(TYPE_IMPORT, '').matchAll(IMPORT)].map(([, s]) => s ?? '');

function walk(file: string, seen = new Map<string, string>()) {
	if (seen.has(file)) return seen;
	const text = readFileSync(file, 'utf8');
	seen.set(file, text);
	for (const specifier of runtimeImports(text)) {
		if (!specifier.startsWith('.')) continue;
		const base = resolve(dirname(file), specifier);
		const target = [`${base}.ts`, join(base, 'index.ts')].find(existsSync);
		if (target) walk(target, seen);
	}
	return seen;
}

describe('the ./coverage subpath', () => {
	const graph = walk(ENTRY);
	const names = [...graph.keys()].map((file) =>
		file.split('/').slice(-2).join('/'),
	);

	it('shares the REST lookup with evaluation, not a matcher of its own', () => {
		expect(names).toContain('evaluation/rest-routes.ts');
		expect(names).toContain('evaluation/graphql-entry.ts');
	});

	it('imports no node: or bun module, and no package but path-to-regexp', () => {
		const bare = [...graph.values()]
			.flatMap(runtimeImports)
			.filter((specifier) => !specifier.startsWith('.'));
		expect([...new Set(bare)]).toEqual(['path-to-regexp']);
	});

	it('does not reach the evaluators, the sources or the rules parser', () => {
		for (const heavy of [
			'rest.ts',
			'field.ts',
			'policy-source.ts',
			'load.ts',
		]) {
			expect(names.map((name) => name.split('/')[1])).not.toContain(heavy);
		}
	});
});

describe('the main entry', () => {
	it('imports no node: or bun module, so it runs in a browser', () => {
		const specifiers = [...walk(MAIN).values()]
			.flatMap(runtimeImports)
			.filter((specifier) => !specifier.startsWith('.'));
		expect(specifiers.filter((s) => /^(node|bun):/.test(s))).toEqual([]);
	});

	it('does not reach loadRules, which lives on ./node', () => {
		const names = [...walk(MAIN).keys()].map((file) => file.split('/').pop());
		expect(names).not.toContain('load.ts');
	});
});
