import { parseArgs } from 'node:util';
import { type JwksKey, jwksOf } from '../index';
import { JWKS_HELP } from './help';
import { type Io, UsageError } from './io';
import { publicJwkOf } from './pem';

/** `jwks`: PEM files in, the public key set out. */
export async function jwksCommand(argv: string[], io: Io): Promise<number> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			key: { type: 'string', multiple: true },
			alg: { type: 'string' },
			out: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
	});
	if (values.help) {
		io.stdout(JWKS_HELP);
		return 0;
	}
	const specs = values.key;
	if (!specs || specs.length === 0) throw new UsageError('missing --key');
	if (positionals.length > 0) {
		throw new UsageError('jwks takes no argument, only --key');
	}
	const entries: JwksKey[] = [];
	for (const spec of specs) {
		const cut = spec.lastIndexOf(':');
		if (cut < 1 || cut === spec.length - 1) {
			throw new UsageError(`--key "${spec}" must be <pem file>:<kid>`);
		}
		const { jwk, alg } = publicJwkOf(
			await io.readFile(spec.slice(0, cut)),
			values.alg,
		);
		entries.push({ key: jwk, kid: spec.slice(cut + 1), alg });
	}
	const set = await jwksOf(entries);
	const text = `${JSON.stringify(set, null, 2)}\n`;
	if (values.out !== undefined) await io.writeFile(values.out, text);
	else io.stdout(text);
	return 0;
}
