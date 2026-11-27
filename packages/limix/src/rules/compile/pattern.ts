/**
 * Port of path-to-regexp v8.4.2 (https://github.com/pillarjs/path-to-regexp),
 * Copyright (c) 2014 Blake Embrey, MIT licence; see LICENSE.
 */
/**
 * The syntax of a REST path pattern: literal text, `:name` (one segment),
 * `*name` (the rest of the path, slashes included), `{...}` (an optional
 * group) and `\` (the next character, literally). A name is an identifier or
 * a quoted string (`:"a-b"`). Parentheses, brackets, `+`, `?` and `!` are
 * refused rather than read as regular-expression syntax.
 */
export type PatternToken =
	| { type: 'text'; value: string }
	| { type: 'param' | 'wildcard'; name: string }
	| { type: 'group'; tokens: PatternToken[] };

/** A pattern that does not parse; the message names the character and its index. */
export class PatternError extends Error {
	constructor(message: string, pattern: string) {
		super(`${message}: ${pattern}`);
		this.name = 'PatternError';
	}
}

const ID_START = /^[$_\p{ID_Start}]$/u;
const ID_CONTINUE = /^(?:[$\p{ID_Continue}]|\u200c|\u200d)$/u;
const REGEXP_SYNTAX = new Set(['(', ')', '[', ']', '+', '?', '!']);

export const isIdStart = (char: string | undefined) =>
	char !== undefined && ID_START.test(char);
export const isIdContinue = (char: string | undefined) =>
	char !== undefined && ID_CONTINUE.test(char);

/** The characters of a pattern and where the parser stands in them. */
interface Cursor {
	chars: string[];
	index: number;
}

/** The name after `:` or `*`: an identifier or a quoted string, `''` when there is none. */
function readName(cursor: Cursor, pattern: string): string {
	const { chars } = cursor;
	const first = chars[cursor.index];
	let name = '';
	if (isIdStart(first)) {
		do name += chars[cursor.index++];
		while (isIdContinue(chars[cursor.index]));
	} else if (first === '"') {
		const start = cursor.index;
		let closed = false;
		while (++cursor.index < chars.length) {
			if (chars[cursor.index] === '"') {
				cursor.index++;
				closed = true;
				break;
			}
			if (chars[cursor.index] === '\\') cursor.index++;
			name += chars[cursor.index] ?? '';
		}
		if (!closed) {
			throw new PatternError(`Unterminated quote at index ${start}`, pattern);
		}
	}
	return name;
}

/** Tokens up to the `end` character (`''` for the end of the pattern). */
function readUntil(
	cursor: Cursor,
	end: string,
	pattern: string,
): PatternToken[] {
	const { chars } = cursor;
	const tokens: PatternToken[] = [];
	let text = '';
	const flush = () => {
		if (text) tokens.push({ type: 'text', value: text });
		text = '';
	};
	while (cursor.index < chars.length) {
		const char = chars[cursor.index++] as string;
		if (char === end) {
			flush();
			return tokens;
		}
		if (char === '\\') {
			if (cursor.index === chars.length) {
				throw new PatternError(
					`Unexpected end after \\ at index ${cursor.index}`,
					pattern,
				);
			}
			text += chars[cursor.index++];
		} else if (char === ':' || char === '*') {
			const name = readName(cursor, pattern);
			if (!name) {
				throw new PatternError(
					`Missing parameter name at index ${cursor.index}, write ${char}name (for example ${char === ':' ? '/:id' : '/*path'}) or escape the ${char} with a backslash`,
					pattern,
				);
			}
			flush();
			tokens.push({ type: char === ':' ? 'param' : 'wildcard', name });
		} else if (char === '{') {
			flush();
			tokens.push({ type: 'group', tokens: readUntil(cursor, '}', pattern) });
		} else if (char === '}') {
			throw new PatternError(
				`Unexpected } at index ${cursor.index - 1} with no { open, escape it with a backslash to match it literally`,
				pattern,
			);
		} else if (REGEXP_SYNTAX.has(char)) {
			throw new PatternError(
				`Unexpected ${char} at index ${cursor.index - 1}, regular expressions are not supported, escape it with a backslash to match it literally`,
				pattern,
			);
		} else text += char;
	}
	if (end) {
		throw new PatternError(
			`Unexpected end at index ${cursor.index}, expected ${end}`,
			pattern,
		);
	}
	flush();
	return tokens;
}

/** Parses a pattern into tokens; throws a `PatternError` naming what is wrong and where. */
export function parsePattern(pattern: string): PatternToken[] {
	return readUntil({ chars: [...pattern], index: 0 }, '', pattern);
}

/**
 * Whether the pattern stands for more than one segment shape: a wildcard, or
 * an optional group that holds a parameter or a wildcard. A group of plain
 * text (an OpenAPI `{id}` brace) names one spelling.
 */
export function opensPattern(tokens: readonly PatternToken[]): boolean {
	return tokens.some((token) =>
		token.type === 'wildcard'
			? true
			: token.type === 'group'
				? token.tokens.some((inner) => inner.type !== 'text') ||
					opensPattern(token.tokens)
				: false,
	);
}
