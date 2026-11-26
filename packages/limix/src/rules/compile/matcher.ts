import { PatternError, type PatternToken, parsePattern } from './pattern';

/** What a matcher hands back for a path it takes. */
export interface MatchResult {
	path: string;
	params: Partial<Record<string, string | string[]>>;
}

/** Takes a request path: the captured parameters, or `false` when it does not fit. */
export type RouteMatcher = (path: string) => MatchResult | false;

type Capture = Extract<PatternToken, { type: 'param' | 'wildcard' }>;

const MAX_COMBINATIONS = 256;
const quote = (text: string) => text.replace(/[.+*?^${}()[\]|/\\]/g, '\\$&');

/** A character that is neither of the two strings (the longer one first), so a capture cannot swallow its own boundary. */
function negate(a: string, b: string): string {
	if (b.length > a.length) return negate(b, a);
	if (a === b) b = '';
	if (b.length > 1) return `(?:(?!${quote(a)}|${quote(b)})[^])`;
	if (a.length > 1) return `(?:(?!${quote(a)})[^${quote(b)}])`;
	return `[^${quote(a + b)}]`;
}

/** Every flat token sequence an optional group makes possible, the group taken before it is left out. */
function flatten(
	tokens: readonly PatternToken[],
	index: number,
	result: PatternToken[],
	emit: (sequence: PatternToken[]) => void,
): void {
	while (index < tokens.length) {
		const token = tokens[index++] as PatternToken;
		if (token.type === 'group') {
			const length = result.length;
			flatten(token.tokens, 0, result, (sequence) =>
				flatten(tokens, index, sequence, emit),
			);
			result.length = length;
			continue;
		}
		result.push(token);
	}
	emit(result);
}

/** One alternative of the expression, `keys` collecting its captures in order. */
function sequenceSource(
	tokens: readonly PatternToken[],
	keys: Capture[],
	pattern: string,
): string {
	let source = '';
	let backtrack = '';
	let wildcardBacktrack = '';
	let previous = 0;
	let seen = 0;
	const textAfter = (from: number) => {
		let text = '';
		for (let i = from; tokens[i]?.type === 'text'; i++) {
			text += (tokens[i] as { value: string }).value;
		}
		return text;
	};
	const wildcardInSegment = (from: number) => {
		for (let i = from; i < tokens.length; i++) {
			const token = tokens[i] as PatternToken;
			if (token.type === 'wildcard') return true;
			if (token.type === 'text' && token.value.includes('/')) break;
		}
		return false;
	};
	for (let index = 0; index < tokens.length; index++) {
		const token = tokens[index] as PatternToken;
		if (token.type === 'text') {
			source += quote(token.value);
			backtrack += token.value;
			if (previous === 2) wildcardBacktrack += token.value;
			if (token.value.includes('/')) seen = 0;
			continue;
		}
		if (token.type === 'group') continue;
		if (previous && !backtrack) {
			throw new PatternError(
				`Missing text before "${token.name}" ${token.type}, put a literal character between two captures`,
				pattern,
			);
		}
		if (token.type === 'param') {
			source +=
				seen & 2
					? `(${negate('/', backtrack)}+)`
					: wildcardInSegment(index + 1)
						? `(${negate('/', textAfter(index + 1))}+)`
						: seen & 1
							? `(${negate('/', backtrack)}+|${quote(backtrack)})`
							: `(${negate('/', '')}+)`;
			seen |= previous = 1;
		} else {
			source +=
				seen & 2
					? `(${negate(backtrack, '')}+)`
					: wildcardBacktrack
						? `(${negate(wildcardBacktrack, '')}+|${negate('/', '')}+)`
						: '([^]+)';
			wildcardBacktrack = '';
			seen |= previous = 2;
		}
		keys.push(token);
		backtrack = '';
	}
	return source;
}

/**
 * Compiles a pattern to one case-insensitive regular expression: a trailing
 * slash is optional, a parameter takes one segment, a wildcard the rest, and
 * each capture is percent-decoded (a wildcard as a list of segments). A
 * pattern that does not parse throws a `PatternError`.
 */
export function compileMatcher(pattern: string): RouteMatcher {
	const keys: Capture[] = [];
	const alternatives: string[] = [];
	flatten(parsePattern(pattern), 0, [], (sequence) => {
		if (alternatives.length >= MAX_COMBINATIONS) {
			throw new PatternError(
				`Too many path combinations, use fewer optional groups`,
				pattern,
			);
		}
		alternatives.push(sequenceSource(sequence, keys, pattern));
	});
	const regexp = new RegExp(`^(?:${alternatives.join('|')})(?:\\/$)?$`, 'i');
	return (path) => {
		const found = regexp.exec(path);
		if (!found) return false;
		const params: MatchResult['params'] = Object.create(null);
		for (let i = 1; i < found.length; i++) {
			const value = found[i];
			if (value === undefined) continue;
			const key = keys[i - 1] as Capture;
			params[key.name] =
				key.type === 'param'
					? decodeURIComponent(value)
					: value.split('/').map(decodeURIComponent);
		}
		return { path: found[0], params };
	};
}
