import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';
import { RULES } from '../keys.fixtures';
import { type Io, processIo } from './io';
import { run } from './run';

let dir: string;
beforeEach(async () => {
	dir = await mkdtemp(join(tmpdir(), 'limix-publish-'));
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const at = (name: string) => join(dir, name);

function capture(): Io & { out: string; err: string } {
	const io = {
		out: '',
		err: '',
		stdout: (text: string) => {
			io.out += text;
		},
		stderr: (text: string) => {
			io.err += text;
		},
		readFile: processIo.readFile,
		writeFile: processIo.writeFile,
	};
	return io;
}

const exec = async (...argv: string[]) => {
	const io = capture();
	const code = await run(argv, io);
	return { code, out: io.out, err: io.err };
};

async function writeKeys(
	name: string,
	alg: 'ES256' | 'EdDSA' | 'RS256' | 'PS256',
) {
	const { privateKey, publicKey } = await generateKeyPair(alg, {
		extractable: true,
		...(alg === 'EdDSA' ? { crv: 'Ed25519' } : {}),
	});
	await writeFile(at(`${name}.pem`), await exportPKCS8(privateKey));
	await writeFile(at(`${name}.pub.pem`), await exportSPKI(publicKey));
}

const writeRules = (name = 'rules.json', rules: unknown = RULES) =>
	writeFile(at(name), JSON.stringify(rules));

describe('limix-publish sign, jwks, check', () => {
	for (const [alg, name] of [
		['ES256', 'ES256'],
		['EdDSA', 'EdDSA'],
		['RS256', 'RS256'],
		['PS256', 'PS256'],
	] as const) {
		it(`signs with an inferred ${name} key, publishes its set, checks the token`, async () => {
			await writeKeys('k', alg);
			await writeRules();
			const signArgs = [
				'sign',
				at('rules.json'),
				'--key',
				at('k.pem'),
				'--kid',
				'k1',
				'--aud',
				'svc',
				'--ver',
				'3',
				'--iss',
				'https://pub.test',
				...(alg === 'PS256' || alg === 'RS256' ? ['--alg', alg] : []),
				'--out',
				at('rules.jwt'),
			];
			expect(await exec(...signArgs)).toMatchObject({ code: 0, out: '' });
			// the token is one line
			expect(
				(await readFile(at('rules.jwt'), 'utf8')).trim().split('.'),
			).toHaveLength(3);

			const jwks = await exec(
				'jwks',
				'--key',
				`${at('k.pub.pem')}:k1`,
				...(alg === 'PS256' || alg === 'RS256' ? ['--alg', alg] : []),
				'--out',
				at('jwks.json'),
			);
			expect(jwks.code).toBe(0);
			const set = JSON.parse(await readFile(at('jwks.json'), 'utf8'));
			expect(set.keys).toHaveLength(1);
			expect(set.keys[0]).toMatchObject({ kid: 'k1', alg, use: 'sig' });

			const check = await exec(
				'check',
				at('rules.jwt'),
				'--jwks',
				at('jwks.json'),
				'--aud',
				'svc',
				'--iss',
				'https://pub.test',
			);
			expect(check.code).toBe(0);
			expect(check.out).toContain('ver: 3');
			expect(check.out).toContain('rest routes: 2');
			expect(check.out).toContain('graphql fields: 0');
			expect(check.out).toMatch(/exp: \d{4}-\d\d-\d\dT/);
		});
	}

	it('prints the token on stdout, takes several --aud and an --expires duration', async () => {
		await writeKeys('k', 'ES256');
		await writeRules();
		const { code, out } = await exec(
			'sign',
			at('rules.json'),
			'--key',
			at('k.pem'),
			'--kid',
			'k1',
			'--aud',
			'a',
			'--aud',
			'b',
			'--ver',
			'1',
			'--expires',
			'30m',
		);
		expect(code).toBe(0);
		const claims = JSON.parse(
			Buffer.from(out.split('.')[1] as string, 'base64url').toString(),
		);
		expect(claims.aud).toEqual(['a', 'b']);
		expect(claims.exp - claims.iat).toBe(1800);
	});

	it('reads a YAML rules file', async () => {
		await writeKeys('k', 'ES256');
		await writeFile(
			at('rules.yaml'),
			'limix: 1\nglobal:\n  unmatched: deny\nrest:\n  /a:\n    GET:\n      public: true\n',
		);
		const { code } = await exec(
			'sign',
			at('rules.yaml'),
			'--key',
			at('k.pem'),
			'--kid',
			'k1',
			'--aud',
			'svc',
			'--ver',
			'1',
		);
		expect(code).toBe(0);
	});

	it('makes a rotation set from a public and a private PEM', async () => {
		await writeKeys('old', 'ES256');
		await writeKeys('new', 'EdDSA');
		const { code, out } = await exec(
			'jwks',
			'--key',
			`${at('old.pub.pem')}:old`,
			'--key',
			`${at('new.pem')}:new`,
		);
		expect(code).toBe(0);
		const set = JSON.parse(out);
		expect(set.keys.map((k: { kid: string }) => k.kid)).toEqual(['old', 'new']);
		expect(out).not.toMatch(/"d":/);
	});

	it('exits 1 on a duplicate kid and on a key that is not a PEM', async () => {
		await writeKeys('a', 'ES256');
		await writeKeys('b', 'ES256');
		const twice = await exec(
			'jwks',
			'--key',
			`${at('a.pub.pem')}:k`,
			'--key',
			`${at('b.pub.pem')}:k`,
		);
		expect(twice.code).toBe(1);
		expect(twice.err).toContain('duplicate kid "k"');
		await writeFile(at('junk.pem'), 'not a key');
		const junk = await exec('jwks', '--key', `${at('junk.pem')}:k`);
		expect(junk.code).toBe(1);
		expect(junk.err).toContain('could not read the key');
	});

	describe('check refuses', () => {
		const sign = async (extra: string[] = []) => {
			await writeKeys('k', 'ES256');
			await writeRules();
			await exec(
				'sign',
				at('rules.json'),
				'--key',
				at('k.pem'),
				'--kid',
				'k1',
				'--aud',
				'svc',
				'--ver',
				'1',
				'--out',
				at('t.jwt'),
				...extra,
			);
			await exec(
				'jwks',
				'--key',
				`${at('k.pub.pem')}:k1`,
				'--out',
				at('j.json'),
			);
		};

		it('a wrong audience, with the code and message, exit 1', async () => {
			await sign();
			const { code, err, out } = await exec(
				'check',
				at('t.jwt'),
				'--jwks',
				at('j.json'),
				'--aud',
				'other',
			);
			expect(code).toBe(1);
			expect(out).toBe('');
			expect(err).toMatch(/^CLAIMS: /);
		});

		it('another publisher key as SIGNATURE', async () => {
			await sign();
			await writeKeys('x', 'ES256');
			await exec(
				'jwks',
				'--key',
				`${at('x.pub.pem')}:k1`,
				'--out',
				at('j.json'),
			);
			const { code, err } = await exec(
				'check',
				at('t.jwt'),
				'--jwks',
				at('j.json'),
				'--aud',
				'svc',
			);
			expect(code).toBe(1);
			expect(err).toMatch(/^SIGNATURE: /);
		});

		it('an expired token, exit 1', async () => {
			await sign(['--expires', '1h']);
			const io = capture();
			const code = await run(
				['check', at('t.jwt'), '--jwks', at('j.json'), '--aud', 'svc'],
				io,
				() => Date.now() + 2 * 3_600_000,
			);
			expect(code).toBe(1);
			expect(io.err).toMatch(/^EXPIRED: /);
		});

		it('a condition the reader did not register, unless --conditions names it', async () => {
			await writeKeys('k', 'ES256');
			await writeRules('c.json', {
				...RULES,
				rest: { '/a': { GET: { authenticated: true, when: ['office'] } } },
			});
			await exec(
				'sign',
				at('c.json'),
				'--key',
				at('k.pem'),
				'--kid',
				'k1',
				'--aud',
				'svc',
				'--ver',
				'1',
				'--out',
				at('t.jwt'),
			);
			await exec(
				'jwks',
				'--key',
				`${at('k.pub.pem')}:k1`,
				'--out',
				at('j.json'),
			);
			const bare = await exec(
				'check',
				at('t.jwt'),
				'--jwks',
				at('j.json'),
				'--aud',
				'svc',
			);
			expect(bare.code).toBe(1);
			expect(bare.err).toMatch(/^RULES_REFUSED: /);
			const named = await exec(
				'check',
				at('t.jwt'),
				'--jwks',
				at('j.json'),
				'--aud',
				'svc',
				'--conditions',
				'office,other',
			);
			expect(named.code).toBe(0);
		});

		it('a missing file, exit 1', async () => {
			const { code } = await exec(
				'check',
				at('nope.jwt'),
				'--jwks',
				at('nope.json'),
				'--aud',
				'svc',
			);
			expect(code).toBe(1);
		});
	});

	describe('sign refuses', () => {
		it('invalid rules, exit 1, naming the path', async () => {
			await writeKeys('k', 'ES256');
			await writeRules('bad.json', { limix: 1 });
			const { code, err } = await exec(
				'sign',
				at('bad.json'),
				'--key',
				at('k.pem'),
				'--kid',
				'k',
				'--aud',
				'svc',
				'--ver',
				'1',
			);
			expect(code).toBe(1);
			expect(err).toContain('Invalid rules');
		});

		it('a condition outside --conditions', async () => {
			await writeKeys('k', 'ES256');
			await writeRules('w.json', {
				...RULES,
				rest: { '/a': { GET: { authenticated: true, when: ['nope'] } } },
			});
			const { code, err } = await exec(
				'sign',
				at('w.json'),
				'--key',
				at('k.pem'),
				'--kid',
				'k',
				'--aud',
				'svc',
				'--ver',
				'1',
				'--conditions',
				'other',
			);
			expect(code).toBe(1);
			expect(err).toContain('nope');
		});

		it('an --alg the key does not fit', async () => {
			await writeKeys('k', 'ES256');
			await writeRules();
			const { code, err } = await exec(
				'sign',
				at('rules.json'),
				'--key',
				at('k.pem'),
				'--kid',
				'k',
				'--aud',
				'svc',
				'--ver',
				'1',
				'--alg',
				'EdDSA',
			);
			expect(code).toBe(1);
			expect(err).toContain('could not import the PKCS#8 key as EdDSA');
		});

		it('a public key where the private one belongs', async () => {
			await writeKeys('k', 'ES256');
			await writeRules();
			const { code } = await exec(
				'sign',
				at('rules.json'),
				'--key',
				at('k.pub.pem'),
				'--kid',
				'k',
				'--aud',
				'svc',
				'--ver',
				'1',
			);
			expect(code).toBe(1);
		});
	});
});

describe('limix-publish refusals of files and keys', () => {
	it('asks for --alg on a plain RSA key, in sign and in jwks, exit 2', async () => {
		await writeKeys('r', 'RS256');
		await writeRules();
		const sign = await exec(
			'sign',
			at('rules.json'),
			'--key',
			at('r.pem'),
			'--kid',
			'k',
			'--aud',
			'svc',
			'--ver',
			'1',
		);
		expect(sign.code).toBe(2);
		expect(sign.err).toContain('--alg RS256 or --alg PS256');
		const jwks = await exec('jwks', '--key', `${at('r.pub.pem')}:k`);
		expect(jwks.code).toBe(2);
		expect(jwks.err).toContain('--alg RS256 or --alg PS256');
	});

	it('tells how to convert a PKCS#1 key', async () => {
		await writeFile(
			at('old.pem'),
			'-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----\n',
		);
		await writeRules();
		for (const extra of [[], ['--alg', 'RS256']]) {
			const { code, err } = await exec(
				'sign',
				at('rules.json'),
				'--key',
				at('old.pem'),
				'--kid',
				'k',
				'--aud',
				'svc',
				'--ver',
				'1',
				...extra,
			);
			expect(code).toBe(1);
			expect(err).toContain('openssl pkcs8 -topk8 -nocrypt');
		}
	});

	it('answers a file error in one line, exit 1, no stack', async () => {
		await writeKeys('k', 'ES256');
		const dirAsKey = await exec('jwks', '--key', `${dir}:k`);
		expect(dirAsKey.code).toBe(1);
		expect(dirAsKey.err.trim().split('\n')).toHaveLength(1);
		const noRules = await exec(
			'sign',
			at('missing.json'),
			'--key',
			at('k.pem'),
			'--kid',
			'k',
			'--aud',
			'svc',
			'--ver',
			'1',
		);
		expect(noRules.code).toBe(1);
		expect(noRules.err.trim().split('\n')).toHaveLength(1);
	});

	it('writes to a path it cannot as one line, exit 1', async () => {
		await writeKeys('k', 'ES256');
		await writeRules();
		const { code, err } = await exec(
			'jwks',
			'--key',
			`${at('k.pub.pem')}:k`,
			'--out',
			at('rules.json/j.json'),
		);
		expect(code).toBe(1);
		expect(err.trim().split('\n')).toHaveLength(1);
	});

	it('reports a missing key set as a file error, not as bad JSON', async () => {
		await writeFile(at('t.jwt'), 'a.b.c');
		const { code, err } = await exec(
			'check',
			at('t.jwt'),
			'--jwks',
			at('nope.json'),
			'--aud',
			'svc',
		);
		expect(code).toBe(1);
		expect(err).not.toContain('is not JSON');
	});

	it('reports a key set that is not JSON', async () => {
		await writeFile(at('t.jwt'), 'a.b.c');
		await writeFile(at('j.json'), '{nope');
		const { code, err } = await exec(
			'check',
			at('t.jwt'),
			'--jwks',
			at('j.json'),
			'--aud',
			'svc',
		);
		expect(code).toBe(1);
		expect(err).toContain('is not JSON');
	});

	it('reports a malformed key set as SIGNATURE without a stack trace', async () => {
		await writeKeys('k', 'ES256');
		await writeRules();
		await exec(
			'sign',
			at('rules.json'),
			'--key',
			at('k.pem'),
			'--kid',
			'k',
			'--aud',
			'svc',
			'--ver',
			'1',
			'--out',
			at('t.jwt'),
		);
		await writeFile(at('j.json'), '{"keys":"nope"}');
		const { code, err } = await exec(
			'check',
			at('t.jwt'),
			'--jwks',
			at('j.json'),
			'--aud',
			'svc',
		);
		expect(code).toBe(1);
		expect(err).toMatch(/^SIGNATURE: the key set is malformed/);
	});
});

describe('limix-publish usage', () => {
	it('treats an inherited property name as an unknown command', async () => {
		for (const name of ['toString', 'constructor', '__proto__']) {
			const { code, err } = await exec(name);
			expect(code).toBe(2);
			expect(err).toContain(`unknown command "${name}"`);
		}
	});

	it('prints the help of the bin and of each command, exit 0', async () => {
		for (const argv of [
			['--help'],
			['-h'],
			['sign', '--help'],
			['jwks', '-h'],
			['check', '--help'],
		]) {
			const { code, out, err } = await exec(...argv);
			expect(code).toBe(0);
			expect(out).toContain('Usage:');
			expect(err).toBe('');
		}
	});

	it('answers usage on stderr and exit 2 for no command, an unknown one, an unknown flag and a missing option', async () => {
		const cases = [
			[],
			['frobnicate'],
			['sign', 'rules.json', '--nope'],
			['sign', 'rules.json'],
			['sign'],
			[
				'sign',
				'r.json',
				'--key',
				'k',
				'--kid',
				'k',
				'--aud',
				'a',
				'--ver',
				'0',
			],
			[
				'sign',
				'r.json',
				'--key',
				'k',
				'--kid',
				'k',
				'--aud',
				'a',
				'--ver',
				'1',
				'--expires',
				'soon',
			],
			['jwks'],
			['jwks', '--key', 'nocolon'],
			['check'],
			['check', 't.jwt'],
			['check', 't.jwt', '--jwks', 'j.json'],
		];
		for (const argv of cases) {
			const { code, out, err } = await exec(...argv);
			expect({ argv, code }).toEqual({ argv, code: 2 });
			expect(out).toBe('');
			expect(err).toContain('Usage:');
		}
	});
});
