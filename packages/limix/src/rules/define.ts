import type { TypedRules } from './register';
import type { Rules } from './schema';

/**
 * Writes a rules document in code. At run time it returns what it is given;
 * at compile time `rules` must be a valid document, so a typo in a key, a
 * method or an enum value fails to compile, a typo beside a valid key
 * included. What it returns is exactly what `parseRules` returns for the same
 * document.
 *
 * Once a generated file registers the API's operations (`Register`, see
 * `@softistx/limix-codegen`), a rest path, method, GraphQL type or field the
 * list does not hold is refused too.
 */
export function definePolicy(rules: TypedRules): Rules {
	return rules as Rules;
}
