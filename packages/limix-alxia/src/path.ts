/**
 * An alxia path as a limix route pattern. alxia ends a path with a bare `*`
 * for the rest of it, limix names that wildcard (`*path`) and reads a bare one
 * as a mistake; alxia has no optional groups or regexes, so a character limix
 * would read as syntax is a literal one here and gets escaped.
 */
export function limixPath(path: string): string {
	const wild = path.endsWith('/*') || path === '*';
	const body = wild ? path.slice(0, -1) : path;
	return `${body.replace(/[\\{}()[\]+?!]/g, '\\$&')}${wild ? '*path' : ''}`;
}

/** The path parameters as limix names them: alxia's `*` is `path`. */
export function paramsOf(
	pathParams: Readonly<Record<string, string>>,
): Record<string, string> {
	const params: Record<string, string> = {};
	for (const [name, value] of Object.entries(pathParams)) {
		params[name === '*' ? 'path' : name] = value;
	}
	return params;
}
