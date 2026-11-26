/** A key written twice in one mapping: the 1-based line of the repeat and of the first. */
export interface DuplicateKey {
	key: string;
	line: number;
	first: number;
}

/** The keys of one mapping, and the repeats found so far. */
export class KeySet {
	readonly seen = new Map<string, number>();
	readonly found: DuplicateKey[] = [];
	/** Set when the mapping holds something the scanner does not understand. */
	skipped = false;

	/** Adds a key by its raw text (quotes included), compared as Bun resolves it. */
	add(raw: string, line: number): void {
		const key = keyId(raw);
		if (key === null) {
			this.skipped = true;
			return;
		}
		const first = this.seen.get(key);
		if (first === undefined) this.seen.set(key, line);
		else this.found.push({ key, line, first });
	}
}

const ids = new Map<string, string | null>();

/** Forgets the keys resolved so far (one scan's cache). */
export function resetKeyIds(): void {
	ids.clear();
}

/**
 * What a key is once Bun has read it: `String(Bun.YAML.parse(raw))`, so `1` and
 * `1.0` are one key, `1.0` and `"1.0"` two, `"\x41"` and `A` one. Null when Bun
 * cannot read it alone, or reads a collection: the caller skips the mapping.
 */
function keyId(raw: string): string | null {
	const known = ids.get(raw);
	if (known !== undefined) return known;
	let id: string | null;
	try {
		const value: unknown = Bun.YAML.parse(raw);
		id = typeof value === 'object' && value !== null ? null : String(value);
	} catch {
		id = null;
	}
	ids.set(raw, id);
	return id;
}

/** The index after the quote that closes the one at `from`, or -1 when it is not closed. */
export function endOfQuoted(text: string, from: number): number {
	const quote = text[from];
	for (let i = from + 1; i < text.length; i++) {
		if (quote === '"' && text[i] === '\\') i++;
		else if (text[i] === quote) {
			if (quote === "'" && text[i + 1] === "'") i++;
			else return i + 1;
		}
	}
	return -1;
}

/** `text` without its trailing ` # comment`; quoted scalars are left whole. */
export function stripComment(text: string): string {
	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		const before = text[i - 1];
		if (
			(char === '"' || char === "'") &&
			(!before || ' \t{[,'.includes(before))
		) {
			const end = endOfQuoted(text, i);
			if (end === -1) return text;
			i = end - 1;
		} else if (char === '#' && (!before || before === ' ' || before === '\t')) {
			return text.slice(0, i).trimEnd();
		}
	}
	return text.trimEnd();
}

/**
 * Net bracket depth change of a line, quoted scalars ignored; null when a
 * quote opens and does not close on the line (the caller stops there).
 */
export function bracketDelta(text: string): number | null {
	let depth = 0;
	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		const before = text[i - 1];
		if (
			(char === '"' || char === "'") &&
			(!before || ' \t{[,:'.includes(before))
		) {
			const end = endOfQuoted(text, i);
			if (end === -1) return null;
			i = end - 1;
		} else if (char === '{' || char === '[') depth++;
		else if (char === '}' || char === ']') depth--;
	}
	return depth;
}

/** Drops leading anchors and tags (`&a`, `!!str`, `!t`) and the spaces after them. */
export function stripProps(text: string): string {
	return text.replace(/^(?:[&!][^\s]*\s+)+/, '');
}

class Bail extends Error {
	constructor(readonly unclosed: boolean) {
		super('flow');
	}
}

const DELIMITERS = ',]}';

function skipSpace(text: string, from: number): number {
	let i = from;
	while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
	return i;
}

/** One flow node at `from`: its end and, for a scalar that can be compared, its raw text. */
function node(
	text: string,
	from: number,
	line: number,
	out: DuplicateKey[],
): { end: number; text: string | null } {
	let i = skipSpace(text, from);
	const props = /^(?:[&!][^\s,\]}]*\s*)+/.exec(text.slice(i));
	if (props) i = skipSpace(text, i + props[0].length);
	const char = text[i];
	if (char === undefined) throw new Bail(true);
	if (char === '{' || char === '[') {
		return { end: collection(text, i, line, out), text: null };
	}
	if (char === '"' || char === "'") {
		const end = endOfQuoted(text, i);
		if (end === -1) throw new Bail(true);
		return { end, text: text.slice(i, end) };
	}
	if (char === '?' && /^\?(\s|$)/.test(text.slice(i))) throw new Bail(false);
	let end = i;
	while (end < text.length && !DELIMITERS.includes(text[end] as string)) {
		if (text[end] === ':' && /[\s,\]}]|^$/.test(text[end + 1] ?? '')) break;
		end++;
	}
	const plain = text.slice(i, end).trim();
	return { end, text: plain.startsWith('*') || plain === '<<' ? null : plain };
}

function collection(
	text: string,
	from: number,
	line: number,
	out: DuplicateKey[],
): number {
	const close = text[from] === '{' ? '}' : ']';
	const keys = new KeySet();
	let i = from + 1;
	for (;;) {
		i = skipSpace(text, i);
		if (i >= text.length) throw new Bail(true);
		if (text[i] === close) {
			if (!keys.skipped) out.push(...keys.found);
			return i + 1;
		}
		if (text[i] === ',') {
			i++;
			continue;
		}
		if (DELIMITERS.includes(text[i] as string)) throw new Bail(false);
		const key = node(text, i, line, out);
		i = skipSpace(text, key.end);
		if (text[i] === ':') i = node(text, i + 1, line, out).end;
		if (close === '}') {
			if (key.text === null) keys.skipped = true;
			else if (key.text !== '') keys.add(key.text, line);
		}
	}
}

/**
 * Scans the flow collection that starts at `text[from]` for repeated keys in
 * its mappings, pushing them to `out`. Returns the index after it, -1 when it
 * is not closed on this line (a multi-line collection), -2 when it holds
 * something the scanner does not read.
 */
export function scanFlow(
	text: string,
	from: number,
	line: number,
	out: DuplicateKey[],
): number {
	try {
		return collection(text, from, line, out);
	} catch (error) {
		if (error instanceof Bail) return error.unclosed ? -1 : -2;
		// Anything else (a RangeError on a very deep nesting) is "not read".
		return -2;
	}
}
