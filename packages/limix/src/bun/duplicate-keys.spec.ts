import { describe, expect, it } from 'bun:test';
import { RulesError } from '../rules/error';
import { refuseDuplicateKeys, scanYaml } from './duplicate-keys';

const dups = (text: string) =>
	scanYaml(text).duplicates.map((d) => `${d.key}@${d.line}/${d.first}`);

describe('scanYaml: reported', () => {
	it('a repeated key in a block mapping, with both lines', () => {
		expect(dups('a: 1\nb: 2\na: 3\n')).toEqual(['a@3/1']);
	});
	it('every repeat, in line order', () => {
		expect(dups('a: 1\nb: 1\na: 2\nb: 2\na: 3\n')).toEqual([
			'a@3/1',
			'b@4/2',
			'a@5/1',
		]);
	});
	it('nested mappings, each on its own', () => {
		expect(dups('x:\n  a: 1\n  a: 2\ny:\n  a: 1\n')).toEqual(['a@3/2']);
		expect(dups('x:\n  a: 1\ny:\n  a: 1\n')).toEqual([]);
	});
	it('a sequence item opens a new mapping', () => {
		expect(dups('- a: 1\n  b: 2\n- a: 3\n')).toEqual([]);
		expect(dups('- a: 1\n  a: 2\n')).toEqual(['a@2/1']);
		expect(dups('k:\n- a: 1\n- a: 2\n  a: 3\n')).toEqual(['a@4/3']);
		expect(dups('k:\n  - - a: 1\n    - a: 1\n')).toEqual([]);
	});
	it('plain, single and double quoted spellings are one key', () => {
		expect(dups(`a: 1\n"a": 2\n'a': 3\n`)).toEqual(['a@2/1', 'a@3/1']);
		expect(dups(`"a: b": 1\n'a: b': 2\n`)).toEqual(['a: b@2/1']);
		expect(dups(`'it''s': 1\n"it's": 2\n`)).toEqual(["it's@2/1"]);
	});
	it('ignores comments, reads keys with a comment after', () => {
		expect(dups('a: 1 # x: 2\n# a: 5\nb: 2\na: 3 # c\n')).toEqual(['a@4/1']);
		expect(dups('a: # c\n  b: 1\n')).toEqual([]);
	});
	it('skips block scalars and their content', () => {
		expect(
			dups('t: |\n  a: 1\n  a: 2\n\n  # a: 3\nu: >-\n  a: 1\n  a: 2\n'),
		).toEqual([]);
		expect(dups('- t: |2\n    a: 1\n    a: 2\n  u: 1\n  u: 2\n')).toEqual([
			'u@5/4',
		]);
		expect(dups('- |\n  a: 1\n  a: 1\n- b: 1\n')).toEqual([]);
	});
	it('reads past anchors, aliases and tags before values and keys', () => {
		expect(dups('x-d: &d\n  a: 1\nb: *d\nc: !!str 1\nb: 2\n')).toEqual([
			'b@5/3',
		]);
		expect(dups('&k a: 1\n!!str a: 2\n')).toEqual(['a@2/1']);
		expect(dups('a: &x { b: 1, b: 2 }\n')).toEqual(['b@1/1']);
	});
	it('single-line flow mappings, nested, quoted and in sequences', () => {
		expect(dups('k: { a: 1, b: 2 }\n')).toEqual([]);
		expect(dups('k: { a: 1, b: 2, a: 3 }\n')).toEqual(['a@1/1']);
		expect(dups('k: { a: { b: 1, b: 2 }, c: [1, { d: 1, d: 2 }] }\n')).toEqual([
			'b@1/1',
			'd@1/1',
		]);
		expect(dups(`- { "a": 1, 'a': 2 }\n`)).toEqual(['a@1/1']);
		expect(dups('- { a: 1 }\n- { a: 1 }\n')).toEqual([]);
		expect(dups('{ a: 1, a: 2 }\n')).toEqual(['a@1/1']);
	});
	it('a repeat after a flow collection or a quoted value is still seen', () => {
		expect(dups('a: { x: 1 }\nb: "q: 1"\na: 2\n')).toEqual(['a@3/1']);
	});
	it('line endings and a BOM do not matter', () => {
		expect(dups('\uFEFFa: 1\r\na: 2\r\n')).toEqual(['a@2/1']);
	});
});

describe('scanYaml: skipped, never a false positive', () => {
	it('lookalikes inside quoted scalars, also multi-line', () => {
		expect(dups('a: "x\n  a: 1\n  a: 2"\nb: \'y\n  b: 1\n  b: 2\'\n')).toEqual(
			[],
		);
		expect(dups('- "x\n  a: 1\n  a: 2"\n')).toEqual([]);
		expect(dups('a: "q \\" \n a: 1\n a: 2"\nc: 1\n')).toEqual([]);
	});
	it('an apostrophe in a plain value is not a quote', () => {
		expect(dups("a: it's # c\nb: 1\nb: 2\n")).toEqual(['b@3/2']);
	});
	it('urls and colons without a space are not keys', () => {
		expect(
			dups('a: http://x\nb: http://x\nhttp://x: 1\nhttp://y: 2\n'),
		).toEqual([]);
	});
	it('complex keys stop the scan', () => {
		expect(dups('? a\n: 1\n? a\n: 2\n')).toEqual([]);
		expect(dups('? |\n  a: 1\n  a: 2\n: x\n')).toEqual([]);
		expect(dups('[a, b]: 1\n[a, b]: 2\n')).toEqual([]);
	});
	it('a mapping with a merge key is not reported', () => {
		expect(dups('x-b: &b { a: 1 }\nm:\n  <<: *b\n  c: 1\n  c: 2\n')).toEqual(
			[],
		);
		expect(dups('m:\n  c: 1\n  <<: *b\n  c: 2\n')).toEqual([]);
		expect(dups('m:\n  c: 1\n  c: 2\nn:\n  d: 1\n  d: 2\n')).toEqual([
			'c@3/2',
			'd@6/5',
		]);
	});
	it('an alias key makes its mapping skipped', () => {
		expect(dups('*a : 1\nb: 1\nb: 2\n')).toEqual([]);
	});
	it('multi-line flow collections are skipped, with their mapping', () => {
		expect(dups('k: {\n  a: 1,\n  a: 2\n}\nz: 1\nz: 2\n')).toEqual([]);
		expect(dups('k: [\n  { a: 1, a: 2 }\n]\n')).toEqual([]);
		expect(dups('k:\n  - { a: 1,\n      a: 2 }\n  - x: 1\n')).toEqual([]);
	});
	it('a flow it does not read is left alone', () => {
		expect(dups('k: { ? a, ? a }\n')).toEqual([]);
		expect(dups('k: { *a : 1, *a : 2 }\n')).toEqual([]);
		expect(dups('k: { <<: *a, b: 1, b: 2 }\n')).toEqual([]);
	});
	it('an empty or comment-only text finds nothing', () => {
		expect(scanYaml('')).toEqual({ documents: 0, duplicates: [] });
		expect(scanYaml('# a: 1\n# a: 2\n').duplicates).toEqual([]);
	});
});

describe('scanYaml: documents', () => {
	it('counts them', () => {
		expect(scanYaml('a: 1\n').documents).toBe(1);
		expect(scanYaml('---\na: 1\n').documents).toBe(1);
		expect(scanYaml('%YAML 1.2\n---\na: 1\n...\n').documents).toBe(1);
		expect(scanYaml('a: 1\n---\na: 2\n').documents).toBe(2);
		expect(scanYaml('a: 1\n...\n---\nb: 2\n').documents).toBe(2);
		expect(scanYaml('a: 1\n---\n---\nb: 2\n').documents).toBe(2);
	});
	it('a repeat across two documents is not one', () => {
		expect(dups('a: 1\n---\na: 2\n')).toEqual([]);
	});
});

describe('refuseDuplicateKeys', () => {
	it('lists every duplicate, with the source', () => {
		try {
			refuseDuplicateKeys('a: 1\nb: 1\na: 2\nb: 2\n', 'rules.yaml');
			throw new Error('did not throw');
		} catch (error) {
			expect(error).toBeInstanceOf(RulesError);
			const issues = (error as RulesError).issues;
			expect(issues.map((i) => i.message)).toEqual([
				'duplicate key "a" at line 3 (first at line 1)',
				'duplicate key "b" at line 4 (first at line 2)',
			]);
			expect((error as RulesError).message).toContain('rules.yaml');
		}
	});
	it('refuses a second document', () => {
		expect(() => refuseDuplicateKeys('a: 1\n---\nb: 1\n', 'r.yaml')).toThrow(
			'a rules file holds one YAML document',
		);
	});
	it('accepts a file without either', () => {
		expect(() =>
			refuseDuplicateKeys('a: 1\nb: [1, 2]\n', 'r.yaml'),
		).not.toThrow();
	});
});
