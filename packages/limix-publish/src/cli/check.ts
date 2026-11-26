import { parseArgs } from 'node:util';
import { RemotePolicyError, verifyRules } from '@softistx/limix/remote';
import type { JSONWebKeySet } from '../jose';
import { CHECK_HELP } from './help';
import { type Io, UsageError } from './io';
import { stubConditions } from './lists';

/** `check`: a token and a key set in, what a reader would see out. */
export async function checkCommand(
	argv: string[],
	io: Io,
	now: () => number = Date.now,
): Promise<number> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			jwks: { type: 'string' },
			aud: { type: 'string' },
			iss: { type: 'string' },
			conditions: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
	});
	if (values.help) {
		io.stdout(CHECK_HELP);
		return 0;
	}
	const [file, ...extra] = positionals;
	if (file === undefined || extra.length > 0) {
		throw new UsageError('check takes exactly one token file (or -)');
	}
	if (values.jwks === undefined) throw new UsageError('missing --jwks');
	if (values.aud === undefined) throw new UsageError('missing --aud');
	const token = (await io.readFile(file)).trim();
	const jwksText = await io.readFile(values.jwks);
	let jwks: JSONWebKeySet;
	try {
		jwks = JSON.parse(jwksText) as JSONWebKeySet;
	} catch (error) {
		io.stderr(`${values.jwks} is not JSON: ${(error as Error).message}\n`);
		return 1;
	}
	try {
		const verified = await verifyRules(token, jwks, {
			audience: values.aud,
			now,
			...(values.iss !== undefined ? { issuer: values.iss } : {}),
			...(values.conditions !== undefined
				? { conditions: stubConditions(values.conditions) }
				: {}),
		});
		const when = new Date(verified.exp * 1000).toISOString();
		if (verified.expired) {
			io.stderr(`EXPIRED: the token expired at ${when}\n`);
			return 1;
		}
		const routes = [...verified.policy.restRoutesByMethod.values()].reduce(
			(sum, list) => sum + list.length,
			0,
		);
		const fields = Object.values(verified.policy.graphql ?? {}).reduce(
			(sum, type) => sum + Object.keys(type).length,
			0,
		);
		io.stdout(
			[
				'ok',
				`ver: ${verified.ver}`,
				`exp: ${when}`,
				`rest routes: ${routes}`,
				`graphql fields: ${fields}`,
				'',
			].join('\n'),
		);
		return 0;
	} catch (error) {
		if (error instanceof RemotePolicyError) {
			io.stderr(`${error.code}: ${error.message}\n`);
			return 1;
		}
		throw error;
	}
}
