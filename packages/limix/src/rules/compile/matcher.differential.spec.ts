import { describe, expect, it } from 'bun:test';
import { match } from 'path-to-regexp';
import { compileMatcher } from './matcher';

// path-to-regexp is a root devDependency: the reference this matcher was
// ported from. This spec pins that the port still agrees with it.

/** A small deterministic generator (mulberry32), so a failure replays. */
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

const random = seeded(0x11a1);
const pick = <T>(items: readonly T[]): T =>
	items[Math.floor(random() * items.length)] as T;

const NAMES = ['id', 'a', 'b', '__proto__', 'constructor', 'x1', '$', 'é'];
const LITERALS = [
	'users',
	'a',
	'B',
	'.',
	'-',
	'_',
	'~',
	'a.b',
	'%41',
	'%',
	'%zz',
	'$',
	'^',
	'|',
	'é',
	'x y',
];
const SPECIAL = [
	'(',
	')',
	'[',
	']',
	'+',
	'?',
	'!',
	'}',
	'{',
	'"',
	':',
	'*',
	'\\',
];
const SEGMENTS = [
	'',
	'a',
	'A',
	'users',
	'a b',
	'a%20b',
	'%41',
	'%E0%A4%A',
	'%zz',
	'%2F',
	'..',
	'.',
	'x-y',
	'é',
	'__proto__',
	'a.b',
];

function pattern(): string {
	let source = '';
	const parts = 1 + Math.floor(random() * 5);
	for (let i = 0; i < parts; i++) {
		const roll = random();
		if (roll < 0.25) source += `/${pick(NAMES) === 'é' ? 'é' : pick(LITERALS)}`;
		else if (roll < 0.5) source += `/:${pick(NAMES)}`;
		else if (roll < 0.58) source += `/:"${pick(['a-b', 'a b', 'x'])}"`;
		else if (roll < 0.66) source += `/*${pick(NAMES)}`;
		else if (roll < 0.74) source += `{/:${pick(NAMES)}}`;
		else if (roll < 0.8) source += `{/${pick(LITERALS)}}`;
		else if (roll < 0.84) source += `{/*${pick(NAMES)}}`;
		else if (roll < 0.88) source += `.${pick(['json', 'x'])}`;
		else if (roll < 0.92) source += `:${pick(NAMES)}-:${pick(NAMES)}`;
		else if (roll < 0.95) source += `\\${pick(SPECIAL)}`;
		else source += pick(SPECIAL);
	}
	return source;
}

/** A path built from the pattern's own shape, then sometimes bent. */
function pathFor(source: string): string {
	let path = '';
	for (const piece of source.split(/(?=\/)/)) {
		const text = piece.replace(/\\(.)/g, '$1');
		if (random() < 0.15) continue;
		path += text
			.replace(/:"[^"]*"|:[^\W]+|:[\p{L}$_][\p{L}\p{N}$_]*/gu, () =>
				pick(SEGMENTS),
			)
			.replace(/\*[\p{L}$_][\p{L}\p{N}$_]*/gu, () =>
				Array.from({ length: Math.floor(random() * 3) }, () =>
					pick(SEGMENTS),
				).join('/'),
			)
			.replace(/[{}]/g, () => (random() < 0.5 ? '' : '/'));
	}
	const roll = random();
	if (roll < 0.15) path += '/';
	else if (roll < 0.25) path = path.toUpperCase();
	else if (roll < 0.3) path += '//';
	return path;
}

/**
 * path-to-regexp has no anonymous wildcard: a `*` with no name after it gets
 * one, which the comparison then drops from the reference's params, as the
 * matcher exposes none.
 */
const BARE = '__bare';
function nameBareWildcards(source: string): string {
	const chars = [...source];
	let out = '';
	let count = 0;
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] as string;
		if (char === '\\') {
			out += char + (chars[++i] ?? '');
		} else if (char === ':' || char === '*') {
			out += char;
			const next = chars[i + 1];
			if (next === '"') {
				out += chars[++i];
				while (++i < chars.length) {
					out += chars[i];
					if (chars[i] === '\\') out += chars[++i] ?? '';
					else if (chars[i] === '"') break;
				}
			} else if (
				char === '*' &&
				(next === undefined || !/^[$_\p{ID_Start}]$/u.test(next))
			) {
				out += `${BARE}${count++}`;
			}
		} else out += char;
	}
	return out;
}

type Outcome =
	| { kind: 'refused' }
	| { kind: 'error'; name: string }
	| {
			kind: 'match';
			path: string;
			params: Record<string, unknown>;
			proto: boolean;
	  };

function run(
	build: () => (path: string) => unknown,
	path: string,
	dropBare = false,
): Outcome {
	try {
		const result = build()(path) as
			| false
			| { path: string; params: Record<string, unknown> };
		if (result === false) return { kind: 'refused' };
		return {
			kind: 'match',
			path: result.path,
			params: Object.fromEntries(
				Object.entries(result.params).filter(
					([name]) => !(dropBare && name.startsWith(BARE)),
				),
			),
			proto: Object.getPrototypeOf(result.params) === null,
		};
	} catch (error) {
		return {
			kind: 'error',
			name: error instanceof URIError ? 'URIError' : 'other',
		};
	}
}

describe('compileMatcher against path-to-regexp v8', () => {
	it('agrees on result, refusal, error kind and null-prototype params', () => {
		let compared = 0;
		let matched = 0;
		let refusedPatterns = 0;
		const seen = new Set<string>();
		while (compared < 4000) {
			const source = pattern();
			if (seen.has(source)) continue;
			seen.add(source);
			let reference: ((path: string) => unknown) | undefined;
			let referenceError: unknown;
			try {
				reference = match(nameBareWildcards(source), {
					decode: decodeURIComponent,
				});
			} catch (error) {
				referenceError = error;
			}
			let ours: ((path: string) => unknown) | undefined;
			let oursError: unknown;
			try {
				ours = compileMatcher(source);
			} catch (error) {
				oursError = error;
			}
			// A pattern one side refuses, the other must refuse too.
			expect([source, Boolean(referenceError)]).toEqual([
				source,
				Boolean(oursError),
			]);
			compared++;
			if (!reference || !ours) {
				refusedPatterns++;
				continue;
			}
			for (let i = 0; i < 3; i++) {
				const path = pathFor(source);
				const want = run(() => reference as never, path, true);
				const got = run(() => ours as never, path);
				expect([source, path, got]).toEqual([source, path, want]);
				if (want.kind === 'match') {
					matched++;
					expect(want.proto).toBe(true);
				}
			}
		}
		// The generator must exercise both sides, or the spec proves nothing.
		expect(matched).toBeGreaterThan(300);
		expect(refusedPatterns).toBeGreaterThan(50);
	});
});
