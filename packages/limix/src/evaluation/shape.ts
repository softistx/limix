import { isIdContinue, isIdStart } from '../rules/compile/pattern';

const shapes = new Map<string, string>();

/** Where the name that starts at `from` ends: an identifier or a quoted string, or `from` when there is none. */
function endOfName(chars: readonly string[], from: number): number {
	let i = from;
	if (isIdStart(chars[i])) {
		do i++;
		while (isIdContinue(chars[i]));
	} else if (chars[i] === '"') {
		i++;
		while (i < chars.length && chars[i] !== '"') i += chars[i] === '\\' ? 2 : 1;
		i++;
	}
	return Math.min(i, chars.length);
}

/**
 * The pattern with its wildcard names left out (`/a/*path` and `/a/*` are one
 * shape): a name is not part of what a wildcard takes, so two spellings that
 * differ only by it are the same rule for a route.
 */
export function shapeOf(pattern: string): string {
	const known = shapes.get(pattern);
	if (known !== undefined) return known;
	const chars = [...pattern];
	let out = '';
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] as string;
		if (char === '\\') {
			out += char + (chars[++i] ?? '');
		} else if (char === '*') {
			out += char;
			i = endOfName(chars, i + 1) - 1;
		} else if (char === ':') {
			const end = endOfName(chars, i + 1);
			out += chars.slice(i, end).join('');
			i = end - 1;
		} else out += char;
	}
	if (shapes.size > 10_000) shapes.clear();
	shapes.set(pattern, out);
	return out;
}
