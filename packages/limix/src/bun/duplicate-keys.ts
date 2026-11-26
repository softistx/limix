import { RulesError } from '../rules/error';
import {
	bracketDelta,
	type DuplicateKey,
	endOfQuoted,
	KeySet,
	scanFlow,
	stripComment,
	stripProps,
	unquote,
} from './flow-keys';

/*
 * Bun.YAML.parse keeps the last of two equal keys without a word; a rules file
 * must not, so loadRules runs this scanner on the text first. It reads what a
 * rules file uses: block mappings by indentation, block sequences (`- key:`
 * opens a mapping), plain, 'single' and "double" quoted keys, comments, block
 * scalars (skipped), anchors, aliases and tags before values, and flow
 * mappings on one line. Hard rule: never a false positive on a valid file, so
 * what it does not understand is skipped, never guessed:
 * - a mapping holding a merge key `<<` or an alias key is not reported;
 * - a multi-line flow collection is skipped, and its mapping is not reported;
 * - a complex key (`? `) stops the scan at that line;
 * - a second document (`---` after content) is counted, not scanned: the
 *   caller refuses it.
 * Quoted and plain spellings of one key (`a`, "a") are the same key.
 */

export interface Scan {
	/** YAML documents in the text (a rules file holds one). */
	documents: number;
	duplicates: DuplicateKey[];
}

const BLOCK_HEADER = /^[|>][+\-0-9]*$/;

class Scanner {
	documents = 0;
	readonly duplicates: DuplicateKey[] = [];
	private stack: { indent: number; set: KeySet }[] = [];
	private content = false;
	private ended = false;
	private stopped = false;
	/** Lines indented deeper than this belong to a block scalar; -1 when none. */
	private block = -1;
	private quote: string | null = null;
	private flow = 0;

	line(raw: string, n: number): void {
		if (this.stopped) return;
		if (this.quote) {
			if (endOfQuoted(this.quote + raw, 0) !== -1) this.quote = null;
			return;
		}
		if (this.block >= 0) {
			if (raw.trim() === '' || indentOf(raw) > this.block) return;
			this.block = -1;
		}
		const text = stripComment(raw);
		if (text.trim() === '') return;
		if (this.flow > 0) {
			this.flow = Math.max(0, this.flow + bracketDelta(text));
			return;
		}
		if (/^---(\s|$)/.test(text)) {
			this.marker(text.slice(3).trim(), n);
			return;
		}
		if (/^\.\.\.(\s|$)/.test(text)) {
			if (this.content) this.end();
			this.ended = true;
			return;
		}
		if (!this.content && text.startsWith('%')) return;
		this.begin();
		this.block_(text, n);
	}

	finish(): Scan {
		this.end();
		this.duplicates.sort((a, b) => a.line - b.line);
		return { documents: this.documents, duplicates: this.duplicates };
	}

	private begin(): void {
		if (this.ended) this.documents++;
		else this.documents = Math.max(this.documents, 1);
		this.ended = false;
		this.content = true;
	}

	private marker(rest: string, n: number): void {
		if (this.content) {
			this.end();
			this.documents++;
			this.ended = false;
		} else if (!this.ended) this.documents = Math.max(this.documents, 1);
		if (rest !== '') {
			this.content = true;
			this.block_(rest, n);
		}
	}

	private end(): void {
		this.close(-1);
		this.content = false;
	}

	/** Closes the mappings indented deeper than `indent`. */
	private close(indent: number): void {
		for (let top = this.stack.at(-1); top && top.indent > indent; ) {
			this.stack.pop();
			if (!top.set.skipped) this.duplicates.push(...top.set.found);
			top = this.stack.at(-1);
		}
	}

	private mapping(indent: number): KeySet {
		this.close(indent);
		let top = this.stack.at(-1);
		if (!top || top.indent < indent) {
			top = { indent, set: new KeySet() };
			this.stack.push(top);
		}
		return top.set;
	}

	private block_(text: string, n: number): void {
		let indent = indentOf(text);
		let rest = text.slice(indent);
		while (rest === '-' || rest.startsWith('- ')) {
			this.close(indent);
			const after = rest.slice(1).trimStart();
			if (after === '') return;
			if (BLOCK_HEADER.test(after)) {
				this.block = indent;
				return;
			}
			indent += rest.length - after.length;
			rest = after;
		}
		this.entry(stripProps(rest), indent, n);
	}

	private entry(text: string, indent: number, n: number): void {
		if (/^\?(\s|$)/.test(text)) {
			this.mapping(indent).skipped = true;
			this.stopped = true;
			return;
		}
		const char = text[0];
		if (char === '{' || char === '[') {
			const end = scanFlow(text, 0, n, this.duplicates);
			if (end === -1) this.openFlow(text, indent);
			else if (end >= 0 && text.slice(end).trimStart().startsWith(':')) {
				this.mapping(indent).skipped = true;
				this.stopped = true;
			}
			return;
		}
		let key: string;
		let rest: string;
		if (char === '"' || char === "'") {
			const end = endOfQuoted(text, 0);
			if (end === -1) {
				this.quote = char;
				return;
			}
			const after = text.slice(end).trimStart();
			if (!/^:(\s|$)/.test(after)) return;
			key = unquote(text.slice(0, end));
			rest = after.slice(1);
		} else {
			const colon = /:(\s|$)/.exec(text);
			if (!colon || colon.index === 0) return;
			key = text.slice(0, colon.index).trimEnd();
			rest = text.slice(colon.index + 1);
		}
		const set = this.mapping(indent);
		if (key === '<<' || key.startsWith('*')) set.skipped = true;
		else set.add(key, n);
		this.value(stripProps(rest.trim()), indent, n, set);
	}

	private value(text: string, indent: number, n: number, set: KeySet): void {
		const char = text[0];
		if (BLOCK_HEADER.test(text)) this.block = indent;
		else if (char === '{' || char === '[') {
			if (scanFlow(text, 0, n, this.duplicates) === -1) {
				set.skipped = true;
				this.openFlow(text, indent);
			}
		} else if (char === '"' || char === "'") {
			if (endOfQuoted(text, 0) === -1) this.quote = char;
		}
	}

	private openFlow(text: string, indent: number): void {
		this.mapping(indent).skipped = true;
		this.flow = Math.max(1, bracketDelta(text));
	}
}

function indentOf(text: string): number {
	return text.length - text.trimStart().length;
}

/** Scans YAML text for keys repeated in one mapping, and counts its documents. */
export function scanYaml(text: string): Scan {
	const scanner = new Scanner();
	const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
	for (let i = 0; i < lines.length; i++)
		scanner.line(lines[i] as string, i + 1);
	return scanner.finish();
}

/** Throws a `RulesError` for a rules file with a repeated key or several documents. */
export function refuseDuplicateKeys(text: string, source: string): void {
	const { documents, duplicates } = scanYaml(text);
	if (documents > 1) {
		throw new RulesError(
			[{ path: '', message: 'a rules file holds one YAML document' }],
			source,
		);
	}
	if (duplicates.length > 0) {
		throw new RulesError(
			duplicates.map(({ key, line, first }) => ({
				path: '',
				message: `duplicate key "${key}" at line ${line} (first at line ${first})`,
			})),
			source,
		);
	}
}
