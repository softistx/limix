/**
 * Whether npmjs knows the package. Every scope, `@softistx/*` included, is on
 * registry.npmjs.org and needs no token. A network failure answers no.
 */
export async function onRegistry(name: string): Promise<boolean> {
	const res = await fetch(
		`https://registry.npmjs.org/${name.replace('/', '%2F')}`,
		{ method: 'HEAD', headers: npmAuth() },
	).catch(() => null);
	return res?.ok ?? false;
}

/** A private package answers 404 without the token: send it when set. */
function npmAuth(): Record<string, string> {
	const token =
		process.env['NPM_TOKEN'] ?? process.env['NPM_SOFTISTX_READ_TOKEN'];
	return token ? { authorization: `Bearer ${token}` } : {};
}
