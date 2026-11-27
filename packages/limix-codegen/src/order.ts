/** The HTTP methods in the order of the rules schema. */
export const METHODS = [
	'GET',
	'POST',
	'PUT',
	'PATCH',
	'DELETE',
	'HEAD',
	'OPTIONS',
	'CONNECT',
	'TRACE',
	'QUERY',
] as const;

const METHOD_ORDER: readonly string[] = METHODS;

/** Code-unit order, never a locale's: the same on every machine. */
export function compareText(a: string, b: string): number {
	return a < b ? -1 : a > b ? 1 : 0;
}

/** A REST label (`GET /a`) by path, then by method in schema order. */
export function compareRest(
	a: { method: string; path: string },
	b: { method: string; path: string },
): number {
	const byPath = compareText(a.path, b.path);
	if (byPath !== 0) return byPath;
	return methodIndex(a.method) - methodIndex(b.method);
}

function methodIndex(method: string): number {
	const index = METHOD_ORDER.indexOf(method.toUpperCase());
	return index === -1 ? METHOD_ORDER.length : index;
}

/** The values sorted by `compare`, each once (by `key`, the value itself by default). */
export function uniqueSorted<T>(
	values: readonly T[],
	compare: (a: T, b: T) => number,
	key: (value: T) => string = String,
): T[] {
	const seen = new Map<string, T>();
	for (const value of values)
		if (!seen.has(key(value))) seen.set(key(value), value);
	return [...seen.values()].sort(compare);
}
