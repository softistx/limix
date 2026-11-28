import { describe, expect, it } from 'bun:test';
import { parse } from 'yaml';
import { scanYaml } from './duplicate-keys';

// `yaml` is a root devDependency, the reference the scanner is compared with:
// it throws "Map keys must be unique" where Bun.YAML.parse keeps the last key.
// It is never imported by src.

function seeded(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const random = seeded(0xd0c5);
const chance = (p: number) => random() < p;
const pick = <T>(items: readonly T[]): T =>
	items[Math.floor(random() * items.length)] as T;

const WORDS = [
	'name',
	'roles',
	'allow',
	'deny',
	'limix',
	'when',
	'from',
	'id',
	'code',
	'x-a',
	'a',
	'b',
	'GET',
	'/users/:id',
];
const SCALARS = [
	'1',
	'true',
	'hello world',
	'"x: y"',
	"'a: 1'",
	'http://a.b/c',
	'[1, 2]',
	'"it\'s # not"',
	'"*"',
	'"a\\"b"',
];

const features = new Set<string>();
let inject = false;
let written = 0;

function key(word: string): string {
	written++;
	const style = random();
	if (style < 0.6) return word;
	if (word.startsWith('/') || word.startsWith('x') || /[^\w]/.test(word)) {
		return chance(0.5) ? `"${word}"` : `'${word}'`;
	}
	features.add('quoted key');
	return style < 0.8 ? `"${word}"` : `'${word}'`;
}

function distinct(count: number, withRepeat: boolean): string[] {
	const pool = [...WORDS].sort(() => random() - 0.5).slice(0, count);
	if (withRepeat && chance(0.35))
		pool.splice(Math.floor(random() * pool.length), 0, pick(pool));
	return pool;
}

function flowMap(depth: number): string {
	const items = distinct(1 + Math.floor(random() * 3), inject).map((word) => {
		const value =
			depth < 2 && chance(0.2)
				? flowMap(depth + 1)
				: pick(SCALARS.filter((s) => !s.includes(',')));
		return `${key(word)}: ${value}`;
	});
	features.add('flow map');
	return `{ ${items.join(', ')} }`;
}

function sequence(depth: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < 1 + Math.floor(random() * 3); i++) {
		if (chance(0.2)) out.push(`- ${pick(SCALARS)}`);
		else if (chance(0.15)) out.push(`- ${flowMap(2)}`);
		else {
			const lines = mapping(depth + 1);
			out.push(
				...lines.map((line, j) => (j === 0 ? `- ${line}` : `  ${line}`)),
			);
		}
	}
	features.add('sequence');
	return out;
}

function entry(word: string, depth: number): string[] {
	const k = key(word);
	const kind = random();
	if (kind < 0.3 || depth >= 3) {
		const comment = chance(0.2) ? ' # a: 1' : '';
		if (comment) features.add('comment');
		return [`${k}: ${pick(SCALARS)}${comment}`];
	}
	if (kind < 0.5) return [`${k}:`, ...mapping(depth + 1).map((l) => `  ${l}`)];
	if (kind < 0.65) {
		const indent = chance(0.5) ? '  ' : '';
		return [`${k}:`, ...sequence(depth).map((l) => indent + l)];
	}
	if (kind < 0.8) {
		features.add('block scalar');
		const fold = pick(['|', '>', '|-', '>+']);
		const body = ['a: 1', 'a: 2', '', '# a: 3', '- a: 4'];
		return [`${k}: ${fold}`, ...body.map((l) => (l ? `  ${l}` : l))];
	}
	return [`${k}: ${flowMap(0)}`];
}

function mapping(depth: number): string[] {
	const out: string[] = [];
	for (const word of distinct(1 + Math.floor(random() * 4), inject)) {
		if (chance(0.15)) {
			features.add('comment');
			out.push('# a: 1');
		}
		out.push(...entry(word, depth));
	}
	return out;
}

function countKeys(value: unknown): number {
	if (Array.isArray(value)) return value.reduce((n, v) => n + countKeys(v), 0);
	if (typeof value !== 'object' || value === null) return 0;
	return Object.values(value).reduce<number>(
		(n, v) => n + countKeys(v),
		Object.keys(value).length,
	);
}

describe('scanYaml against the yaml package', () => {
	it('reports a duplicate exactly when yaml refuses the key', () => {
		let withRepeat = 0;
		let without = 0;
		const COUNT = 3000;
		for (let i = 0; i < COUNT; i++) {
			inject = chance(0.4);
			written = 0;
			const text = `${mapping(0).join('\n')}\n`;
			let refused = false;
			try {
				parse(text);
			} catch (error) {
				if (!(error as Error).message.includes('Map keys must be unique')) {
					throw new Error(
						`generated invalid YAML: ${(error as Error).message}\n${text}`,
					);
				}
				refused = true;
			}
			const found = scanYaml(text).duplicates.length > 0;
			if (found !== refused) {
				throw new Error(
					`scanner ${found ? 'found' : 'missed'} a duplicate, yaml ${refused ? 'refuses' : 'accepts'}:\n${text}`,
				);
			}
			// Never a false positive: a report must be a real collapse in Bun.
			const kept = countKeys(Bun.YAML.parse(text));
			if (found) expect(kept).toBeLessThan(written);
			else if (!refused) expect(kept).toBe(written);
			if (refused) withRepeat++;
			else without++;
		}
		expect(withRepeat).toBeGreaterThan(400);
		expect(without).toBeGreaterThan(1500);
		for (const feature of [
			'quoted key',
			'flow map',
			'sequence',
			'comment',
			'block scalar',
		]) {
			expect(features.has(feature)).toBe(true);
		}
	});
});

describe('scanYaml cost', () => {
	it('grows about linearly: 10k lines cost under 300 times 100 lines (linear is 100)', () => {
		const doc = (lines: number) =>
			Array.from(
				{ length: lines },
				(_, i) => `k${i}: { a: 1, b: [x, y] }`,
			).join('\n');
		// Wall-clock cost cannot be counted exactly without test-only API, and a
		// loaded machine adds noise to any single measurement. Noise only ever
		// adds time, so the fastest of several interleaved samples is the
		// steadiest estimate of the real cost. A quadratic scan would cost about
		// 10000 times more on 100 times more lines, far past the 300 bound.
		const once = (text: string) => {
			const began = performance.now();
			scanYaml(text);
			return performance.now() - began;
		};
		const smallText = doc(100);
		const largeText = doc(10000);
		once(smallText);
		once(largeText);
		let small = Number.POSITIVE_INFINITY;
		let large = Number.POSITIVE_INFINITY;
		for (let i = 0; i < 9; i++) {
			// Many repeats of the small text so its sample is not timer-resolution bound.
			const began = performance.now();
			for (let j = 0; j < 20; j++) scanYaml(smallText);
			small = Math.min(small, (performance.now() - began) / 20);
			large = Math.min(large, once(largeText));
		}
		expect(large).toBeLessThan(small * 100 * 3);
	});
});
