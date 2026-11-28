import { describe, expect, it } from 'bun:test';
import { FIXTURE_OPENAPI_YAML, FIXTURE_SDL } from '../codegen.fixtures';
import type { Io } from './io';
import { run } from './run';

function fakeIo(initial: Record<string, string> = {}) {
	const files = new Map(Object.entries(initial));
	const out: string[] = [];
	const err: string[] = [];
	const writes: string[] = [];
	const io: Io = {
		stdout: (text) => void out.push(text),
		stderr: (text) => void err.push(text),
		readFile: async (path) => {
			const text = files.get(path);
			if (text === undefined) {
				throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });
			}
			return text;
		},
		writeFile: async (path, text) => {
			files.set(path, text);
			writes.push(path);
		},
		exists: async (path) => files.has(path),
	};
	return { io, files, out, err, writes };
}

const INPUTS = {
	'schema.graphql': FIXTURE_SDL,
	'openapi.yaml': FIXTURE_OPENAPI_YAML,
};
const FLAGS = [
	'--graphql',
	'schema.graphql',
	'--openapi',
	'openapi.yaml',
	'--out',
	'gen.ts',
];

describe('generate', () => {
	it('writes the file, then reports it up to date without writing again', async () => {
		const t = fakeIo(INPUTS);
		expect(await run(['generate', ...FLAGS], t.io)).toBe(0);
		expect(t.out).toEqual(['wrote gen.ts\n']);
		expect(t.files.get('gen.ts')).toContain("'GET /notes'");
		expect(await run(['generate', ...FLAGS], t.io)).toBe(0);
		expect(t.out.at(-1)).toBe('gen.ts is up to date\n');
		expect(t.writes).toEqual(['gen.ts']);
	});

	it('--check passes on an equal file, also with CRLF', async () => {
		const t = fakeIo(INPUTS);
		await run(['generate', ...FLAGS], t.io);
		expect(await run(['generate', ...FLAGS, '--check'], t.io)).toBe(0);
		t.files.set('gen.ts', (t.files.get('gen.ts') ?? '').replace(/\n/g, '\r\n'));
		expect(await run(['generate', ...FLAGS, '--check'], t.io)).toBe(0);
		expect(t.out.at(-1)).toBe('gen.ts is up to date\n');
		expect(t.writes).toEqual(['gen.ts']);
	});

	it('--check fails on a different file and on a missing one, writing nothing', async () => {
		const t = fakeIo({ ...INPUTS, 'gen.ts': 'old\n' });
		expect(await run(['generate', ...FLAGS, '--check'], t.io)).toBe(1);
		expect(t.err.at(-1)).toBe(
			'gen.ts is out of date: run limix-codegen generate with the same flags and commit it\n',
		);
		const m = fakeIo(INPUTS);
		expect(await run(['generate', ...FLAGS, '--check'], m.io)).toBe(1);
		expect(m.err.at(-1)).toContain('gen.ts is missing: run limix-codegen');
		expect(t.writes).toEqual([]);
		expect(m.writes).toEqual([]);
	});

	it('defaults the output', async () => {
		const t = fakeIo(INPUTS);
		expect(await run(['generate', '--openapi', 'openapi.yaml'], t.io)).toBe(0);
		expect(t.files.get('src/generated/limix.ts')).toContain('LimixRest');
	});

	it('--check is only about the file: missing or out of date, never a rule', async () => {
		const t = fakeIo(INPUTS);
		await run(['generate', ...FLAGS], t.io);
		expect(await run(['generate', ...FLAGS, '--check'], t.io)).toBe(0);
		expect(t.err).toEqual([]);
	});

	it('knows no --rules: an unknown flag, exit 2, in generate and in init', async () => {
		const t = fakeIo({ ...INPUTS, 'rules.yaml': 'limix: 1\n' });
		for (const command of ['generate', 'init']) {
			expect(
				await run(
					[command, '--openapi', 'openapi.yaml', '--rules', 'rules.yaml'],
					t.io,
				),
			).toBe(2);
		}
		expect(t.err[0]).toContain("Unknown option '--rules'");
		expect(t.writes).toEqual([]);
		expect(t.err.join('')).not.toContain('--rules <file>');
	});

	it('refuses no input and a bad flag with exit 2 and the help', async () => {
		const t = fakeIo();
		expect(await run(['generate'], t.io)).toBe(2);
		expect(t.err[0]).toContain('give at least one of --graphql, --openapi');
		expect(t.err[0]).toContain('Usage: limix-codegen generate');
		expect(await run(['generate', '--nope'], t.io)).toBe(2);
	});

	it('answers a bad OpenAPI file with exit 1', async () => {
		const t = fakeIo({ 'bad.yaml': 'openapi: 3\n' });
		expect(await run(['generate', '--openapi', 'bad.yaml'], t.io)).toBe(1);
		expect(t.err[0]).toContain('bad.yaml: not an OpenAPI document');
	});

	it('answers a missing file with exit 1', async () => {
		const t = fakeIo();
		expect(await run(['generate', '--openapi', 'no.yaml'], t.io)).toBe(1);
		expect(t.err[0]).toContain('ENOENT');
	});
});

describe('generate, refusals', () => {
	it('refuses an --out that is an input, exit 2', async () => {
		const t = fakeIo(INPUTS);
		const code = await run(
			['generate', '--openapi', 'openapi.yaml', '--out', './openapi.yaml'],
			t.io,
		);
		expect(code).toBe(2);
		expect(t.err[0]).toContain('is also an input');
		expect(t.writes).toEqual([]);
	});

	it('names the SDL file that does not parse, exit 1', async () => {
		const t = fakeIo({ ...INPUTS, 'bad.graphql': 'type Query {' });
		const code = await run(['generate', '--graphql', 'bad.graphql'], t.io);
		expect(code).toBe(1);
		expect(t.err[0]).toMatch(/^bad\.graphql:1:\d+: /);
	});

	it('still joins files, so an extension across files works', async () => {
		const t = fakeIo({
			'a.graphql': 'type Query { me: String }',
			'b.graphql': 'extend type Query { you: String }',
		});
		const code = await run(
			[
				'generate',
				'--graphql',
				'a.graphql',
				'--graphql',
				'b.graphql',
				'--out',
				'g.ts',
			],
			t.io,
		);
		expect(code).toBe(0);
		expect(t.files.get('g.ts')).toContain('Query.you');
	});

	it('writes the same header whatever the order of two --openapi flags', async () => {
		const files = { ...INPUTS, 'other.yaml': FIXTURE_OPENAPI_YAML };
		const one = fakeIo(files);
		const two = fakeIo(files);
		const base = ['generate', '--out', 'g.ts'];
		await run(
			[...base, '--openapi', 'openapi.yaml', '--openapi', 'other.yaml'],
			one.io,
		);
		await run(
			[...base, '--openapi', 'other.yaml', '--openapi', 'openapi.yaml'],
			two.io,
		);
		expect(one.files.get('g.ts')).toBe(two.files.get('g.ts'));
		expect(one.files.get('g.ts')).toContain('from openapi.yaml, other.yaml.');
	});
});

describe('init', () => {
	const base = [
		'init',
		'--graphql',
		'schema.graphql',
		'--openapi',
		'openapi.yaml',
	];

	it('writes a starter policy once and leaves an existing file alone', async () => {
		const t = fakeIo(INPUTS);
		const args = [...base, '--out', 'src/policy.ts'];
		expect(await run(args, t.io)).toBe(0);
		expect(t.out[0]).toBe(
			'wrote src/policy.ts (6 operations, unmatched: deny)\n',
		);
		const first = t.files.get('src/policy.ts') ?? '';
		expect(first).toContain("import './generated/limix';");
		expect(first).toContain("import { definePolicy } from '@softistx/limix';");
		expect(first).toContain("global: { unmatched: 'deny' }");
		expect(await run(args, t.io)).toBe(0);
		expect(t.err[0]).toContain(
			'src/policy.ts exists: init never rewrites a policy',
		);
		expect(t.files.get('src/policy.ts')).toBe(first);
		expect(t.writes).toEqual(['src/policy.ts']);
	});

	it('defaults the policy to src/policy.ts and imports the types relative to it', async () => {
		const t = fakeIo(INPUTS);
		await run(['init', '--openapi', 'openapi.yaml'], t.io);
		expect(t.files.get('src/policy.ts')).toContain(
			"import './generated/limix';",
		);
		const other = fakeIo(INPUTS);
		await run(
			[
				'init',
				'--openapi',
				'openapi.yaml',
				'--out',
				'app/auth/policy.ts',
				'--types',
				'gen/limix.ts',
			],
			other.io,
		);
		expect(other.files.get('app/auth/policy.ts')).toContain(
			"import '../../gen/limix';",
		);
	});

	it('writes flat keys with --flat', async () => {
		const t = fakeIo(INPUTS);
		expect(await run([...base, '--flat', '--out', 'f.ts'], t.io)).toBe(0);
		const flat = t.files.get('f.ts') ?? '';
		expect(flat).toContain("'GET /notes': { authenticated: true },");
		expect(flat).toContain("'Query.me': { authenticated: true },");
		expect(await run([...base, '--out', 'n.ts'], t.io)).toBe(0);
		expect(t.files.get('n.ts')).toContain("'/notes': {\n\t\t\tGET:");
	});

	it('refuses no input and a policy that is not a .ts file with exit 2', async () => {
		const t = fakeIo(INPUTS);
		expect(await run(['init'], t.io)).toBe(2);
		expect(
			await run(['init', '--openapi', 'openapi.yaml', '--out', 'p.yaml'], t.io),
		).toBe(2);
		expect(t.err.at(-1)).toContain('the policy is TypeScript');
		expect(t.writes).toEqual([]);
	});
});

describe('the command line', () => {
	it('prints help, and refuses an unknown or missing command with exit 2', async () => {
		const t = fakeIo();
		expect(await run(['--help'], t.io)).toBe(0);
		expect(t.out[0]).toContain('limix-codegen');
		expect(await run(['generate', '--help'], t.io)).toBe(0);
		expect(await run(['init', '-h'], t.io)).toBe(0);
		expect(await run(['nope'], t.io)).toBe(2);
		expect(t.err[0]).toContain('unknown command "nope"');
		expect(await run([], t.io)).toBe(2);
	});
});
