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

/**
 * The path a request is judged by: the declared route (prefix included) with
 * the decoded parameters put back. A parameter stays one segment (`/` and `%`
 * in its value are percent-encoded again), a wildcard keeps its slashes. So
 * `/users/%6De` on `/users/:id` is judged as `/users/me`, as the handler sees it.
 */
export function decodedPath(
	route: string,
	pathParams: Readonly<Record<string, string>>,
): string {
	return route
		.split('/')
		.map((segment) => {
			if (segment === '*') return pathParams['*'] ?? '';
			if (!segment.startsWith(':')) return segment;
			const value = pathParams[segment.slice(1)] ?? '';
			return value.replace(/%/g, '%25').replace(/\//g, '%2F');
		})
		.join('/');
}
