import { parseArgs } from 'node:util';
import { loadRules } from '@softistx/limix/bun';
import { signRules } from '../index';
import { parseDuration } from './duration';
import { SIGN_HELP } from './help';
import { type Io, UsageError } from './io';
import { splitList } from './lists';
import { privateKeyOf } from './pem';

function required<T>(value: T | undefined, flag: string): T {
	if (value === undefined) throw new UsageError(`missing ${flag}`);
	return value;
}

/** `sign`: rules file and key in, token out. */
export async function signCommand(argv: string[], io: Io): Promise<number> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			key: { type: 'string' },
			kid: { type: 'string' },
			aud: { type: 'string', multiple: true },
			ver: { type: 'string' },
			iss: { type: 'string' },
			alg: { type: 'string' },
			expires: { type: 'string' },
			conditions: { type: 'string' },
			out: { type: 'string' },
			help: { type: 'boolean', short: 'h' },
		},
	});
	if (values.help) {
		io.stdout(SIGN_HELP);
		return 0;
	}
	const [file, ...extra] = positionals;
	if (file === undefined || extra.length > 0) {
		throw new UsageError('sign takes exactly one rules file');
	}
	const keyFile = required(values.key, '--key');
	const kid = required(values.kid, '--kid');
	const audience = required(values.aud, '--aud');
	const verText = required(values.ver, '--ver');
	const ver = /^\d+$/.test(verText) ? Number(verText) : Number.NaN;
	if (!Number.isSafeInteger(ver) || ver < 1) {
		throw new UsageError(`--ver "${verText}" must be a positive integer`);
	}
	const expiresIn =
		values.expires === undefined ? undefined : parseDuration(values.expires);
	const rules = await loadRules(file);
	const { key, alg } = await privateKeyOf(
		await io.readFile(keyFile),
		values.alg,
	);
	const token = await signRules(rules, {
		key,
		alg,
		kid,
		audience: audience.length === 1 ? (audience[0] as string) : audience,
		ver,
		...(values.iss !== undefined ? { issuer: values.iss } : {}),
		...(expiresIn !== undefined ? { expiresIn } : {}),
		...(values.conditions !== undefined
			? { conditions: splitList(values.conditions) }
			: {}),
	});
	if (values.out !== undefined) await io.writeFile(values.out, `${token}\n`);
	else io.stdout(`${token}\n`);
	return 0;
}
