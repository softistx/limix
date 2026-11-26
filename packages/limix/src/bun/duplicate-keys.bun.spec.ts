import { describe, expect, it } from 'bun:test';
import { RulesError } from '../rules/error';
import { refuseDuplicateKeys, scanYaml } from './duplicate-keys';
import { loadRules } from './load';

const dups = (text: string) =>
	scanYaml(text).duplicates.map((d) => `${d.key}@${d.line}/${d.first}`);
const keys = (text: string) => Object.keys(Bun.YAML.parse(text) as object);

describe('keys are compared the way Bun resolves them', () => {
	const same: [string, string][] = [
		['1', '1.0'],
		['null', '~'],
		['"\\x41"', 'A'],
		['0x10', '16'],
		['true', '"true"'],
	];
	for (const [a, b] of same) {
		it(`${a} and ${b} are one key, Bun collapses them`, () => {
			const text = `${a}: x\n${b}: y\n`;
			expect(keys(text)).toHaveLength(1);
			expect(dups(text)).toHaveLength(1);
		});
	}
	const distinct: [string, string][] = [
		['1.0', '"1.0"'],
		['~', '"~"'],
		['0x10', '"0x10"'],
		['1', '"1.0"'],
		['.inf', '"inf"'],
	];
	for (const [a, b] of distinct) {
		it(`${a} and ${b} are two keys, Bun keeps both`, () => {
			const text = `${a}: x\n${b}: y\n`;
			expect(keys(text)).toHaveLength(2);
			expect(dups(text)).toEqual([]);
		});
	}
	it('the same in a flow mapping', () => {
		expect(dups('k: { 1.0: a, "1.0": b }\n')).toEqual([]);
		expect(dups('k: { 1: a, 1.0: b }\n')).toEqual(['1@1/1']);
	});
	it('a key Bun cannot read alone skips its mapping', () => {
		expect(dups('@a: 1\n@a: 2\nb: 1\nb: 2\n')).toEqual([]);
		expect(dups('x:\n  b: 1\n  b: 2\n@a: 1\n')).toEqual(['b@3/2']);
	});
});

describe('block scalars and flows the review found', () => {
	it('a bare | or > after an empty value starts a block scalar', () => {
		expect(dups('a:\n  |\n  a: 1\n  a: 1\n')).toEqual([]);
		expect(dups('a:\n  >-\n  a: 1\n  a: 1\nb: 1\nb: 2\n')).toEqual(['b@6/5']);
		expect(dups('--- |\n  a: 1\n  a: 1\n')).toEqual([]);
	});
	it('an unclosed quote in a multi-line flow stops the scan', () => {
		const texts = [
			'a: [\n  "x\n  y", b ]\nc: |\n  c: 1\n  c: 1\n',
			"a: [\n  'x\n  y', b ]\nc: 1\nc: 2\n",
			'a: [ "x\n  y", b ]\nc: 1\nc: 2\n',
			'a: { b: "x\n  y", c: 1 }\nd:\n  e: 1\n  e: 2\n',
		];
		for (const text of texts) expect(dups(text)).toEqual([]);
	});
	it('an apostrophe inside a multi-line flow is not a quote', () => {
		expect(dups("a: [\n  it's,\n  b ]\nx:\n  c: 1\n  c: 2\n")).toEqual([
			'c@6/5',
		]);
	});
});

describe('the cases of the adversarial probes', () => {
	const none: Record<string, string> = {
		blockScalars:
			'a: |\n  a: 1\n  a: 1\nb: >-\n  b: 1\n  b: 1\nc: |2\n    c: 1\n    c: 1\nd: !!str |\n  d: 1\n  d: 1\ne: &x |\n  e: 1\n  e: 1\n',
		blockInSeq: '- |\n  a: 1\n  a: 1\n- a: |\n    a: 1\n    a: 1\n',
		blockKeep: 'a: |+\n  x: 1\n\n  x: 1\n\nb: 1\n',
		quotedMultiline:
			"a: \"first\n  a: 1\n  a: 2\"\nb: 'it''s\n  b: 1\n  b: 2'\nc: 1\n",
		hashInQuotes: '"a # b": 1\n\'a # c\': 2\nx: "# y" # z\ny: \'q # r\'\n',
		seqAcross:
			'- a: 1\n  b: 2\n- a: 3\n  b: 4\n-\n  a: 5\n- - a: 1\n  - a: 1\n',
		nested: 'a:\n  a:\n    a: 1\n  b:\n    a: 1\nb:\n  a: 1\n',
		flowMaps:
			'a: { a: 1, b: { a: 2 } }\nb: [ { a: 1 }, { a: 2 } ]\nc: { "a": 1, b: 2 }\nd: [a: 1, a: 2]\n',
		anchors:
			'base: &b { x: 1 }\nother: *b\nlist: &l\n  - a: 1\nmore: *l\n&k key: 1\n',
		merge: 'base: &b\n  x: 1\nchild:\n  <<: *b\n  x: 2\n',
		tags: 'a: !!str 1\nb: !custom\n  c: 1\n!!str d: 2\ne: !!map\n  f: 1\n',
		tabs: 'a:\t1\nb:\t  2\n-\ta: 1\n',
		urls: 'a: http://x:80/a: b\nb: c:d\n',
		colonInKey: 'a:b: 1\na:c: 2\n',
		multiFlow: 'a: [\n  1,\n  2\n]\nb: {\n  x: 1,\n  y: 2\n}\nc: 1\n',
		multiFlowBlock: 'a: [ "x\n  y", b ]\nc: |\n  ] \n  c: 1\n  c: 1\n',
		numeric: '1: a\n"1.0": b\n',
		spaces: 'a b: 1\na  b: 2\n',
		dashKeys: '-a: 1\n-b: 2\n',
		complexKey: '? a\n: 1\na: 2\na: 3\n',
		jsonish: '{"a": 1, "b": 2}\n',
		merge2: 'b: &b {x: 1}\nc:\n  <<: *b\n  y: 1\n  y: 2\n',
	};
	for (const [name, text] of Object.entries(none)) {
		it(`${name}: nothing is reported unless Bun collapses`, () => {
			const found = dups(text).length > 0;
			if (found) throw new Error(`reported ${dups(text)} on ${name}`);
		});
	}
	it('reported cases are collapses in Bun', () => {
		for (const text of [
			'1: a\n1.0: b\n',
			'null: a\n~: b\n',
			'"\\x41": a\nA: b\n',
			'a : 1\na: 2\n',
			'x: [ {a: 1, a: 2} ]\n',
		]) {
			expect(dups(text).length).toBeGreaterThan(0);
		}
		expect(keys('"a": 1\n"a": 2\n')).toEqual(['a']);
	});
	it('documents: ---, ..., and the double dash', () => {
		expect(scanYaml('---\n---\na: 1\n').documents).toBe(1);
		expect(scanYaml('a: 1\n...\nb: 2\n').documents).toBe(2);
		expect(scanYaml('--- {a: 1, a: 2}\n').duplicates).toHaveLength(1);
	});
});

describe('deep nesting', () => {
	it('never escapes as a raw error from the scanner', () => {
		for (const n of [5000, 20000, 200000]) {
			const text = `a: ${'['.repeat(n)}${']'.repeat(n)}\nb: 1\nb: 2\n`;
			expect(() => scanYaml(text)).not.toThrow();
			expect(dups(text)).toEqual(['b@3/2']);
		}
	});
	it('and a deep flow in a file is a RulesError or valid, never a RangeError', async () => {
		const path = `${import.meta.dir}/deep-${crypto.randomUUID()}.yaml`;
		await Bun.write(path, `a: ${'['.repeat(20000)}${']'.repeat(20000)}\n`);
		try {
			await loadRules(path);
			throw new Error('did not throw');
		} catch (error) {
			expect(error).toBeInstanceOf(RulesError);
		} finally {
			await Bun.file(path).delete();
		}
	});
	it('refuseDuplicateKeys on it does not throw a RangeError', () => {
		const text = `a: ${'['.repeat(20000)}${']'.repeat(20000)}\n`;
		expect(() => refuseDuplicateKeys(text, 'r.yaml')).not.toThrow();
	});
});
