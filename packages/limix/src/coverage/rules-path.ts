/**
 * An OpenAPI path in the rules-file spelling: each whole `{name}` segment
 * becomes `:name`, so `/things/{id}` reads `/things/:id`. Other segments are
 * left as they are, a `{id}.json` suffix included.
 */
export function rulesPathOf(openApiPath: string): string {
	return openApiPath
		.split('/')
		.map((segment) => segment.replace(/^\{([^{}/]+)\}$/, ':$1'))
		.join('/');
}
