import type { Condition } from '@softistx/limix';

/** `a, b,,c` as `['a', 'b', 'c']`. */
export const splitList = (text: string): string[] =>
	text
		.split(',')
		.map((item) => item.trim())
		.filter(Boolean);

const accept: Condition = () => true;

/** A registry that accepts every name, so only the names are checked. */
export function stubConditions(text: string): Record<string, Condition> {
	return Object.fromEntries(splitList(text).map((name) => [name, accept]));
}
