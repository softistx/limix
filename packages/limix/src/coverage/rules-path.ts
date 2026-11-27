import { isIdContinue, isIdStart } from '../rules/compile/pattern';

const SYNTAX = new Set(['\\', '(', ')', '[', ']', '+', '?', '!', ':', '*']);

/** True when the pattern parser reads `name` as a bare `:name` followed by `next`. */
function readsBare(name: string, next: string | undefined): boolean {
	const chars = Array.from(name);
	return (
		isIdStart(chars[0]) &&
		chars.slice(1).every((char) => isIdContinue(char)) &&
		!isIdContinue(next)
	);
}

/**
 * An OpenAPI path in the spelling of a rules file: `/notes/{id}` becomes
 * `/notes/:id`, and `/files/{id}.json` becomes `/files/:id.json`. A name that
 * is no identifier, or that runs into the text after it (`{id}x`), is quoted
 * (`:"id"x`); characters the pattern syntax owns are escaped (`/a:b*` becomes
 * `/a\:b\*`).
 *
 * Throws a `TypeError` for a path that has no limix spelling: an unbalanced
 * brace, an empty `{}`, or two adjacent parameters (`/{a}{b}`: limix needs
 * literal text between two captures).
 */
export function rulesPathOf(openApiPath: string): string {
	const chars = Array.from(openApiPath);
	let out = '';
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] as string;
		if (char === '}') {
			throw new TypeError(`unbalanced } in path ${openApiPath}`);
		}
		if (char !== '{') {
			out += SYNTAX.has(char) ? `\\${char}` : char;
			continue;
		}
		const end = chars.indexOf('}', i);
		if (end === -1) throw new TypeError(`unbalanced { in path ${openApiPath}`);
		const name = chars.slice(i + 1, end).join('');
		if (name === '') throw new TypeError(`empty {} in path ${openApiPath}`);
		if (chars[end + 1] === '{') {
			throw new TypeError(
				`adjacent parameters in ${openApiPath}: limix needs literal text between two captures`,
			);
		}
		out += readsBare(name, chars[end + 1])
			? `:${name}`
			: `:"${name.replace(/[\\"]/g, '\\$&')}"`;
		i = end;
	}
	return out;
}
