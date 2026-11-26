import type { Rules } from './schema';

/**
 * Writes a rules document in code. At run time it returns what it is given;
 * at compile time `rules` must be a valid document, so a typo in a key, a
 * method or an enum value fails to compile, a typo beside a valid key
 * included. What it returns is exactly what `parseRules` returns for the same
 * document.
 */
export function definePolicy(rules: Rules): Rules {
	return rules;
}
