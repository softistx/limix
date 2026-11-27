import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	FIXTURE_OPENAPI_YAML,
	FIXTURE_RULES_YAML,
	FIXTURE_SDL,
} from '../codegen.fixtures';
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
	'rules.yaml': FIXTURE_RULES_YAML,
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

	it('reads the rules file from disk and defaults the output', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'limix-codegen-'));
		try {
			const rules = join(dir, 'rules.yaml');
			await Bun.write(rules, FIXTURE_RULES_YAML);
			const t = fakeIo();
			expect(await run(['generate', '--rules', rules], t.io)).toBe(0);
			expect(t.files.get('src/generated/limix.ts')).toContain('LimixRole');
		} finally {
			await rm(dir, { recursive: true });
		}
	});

	it('refuses no input and a bad flag with exit 2 and the help', async () => {
		const t = fakeIo();
		expect(await run(['generate'], t.io)).toBe(2);
		expect(t.err[0]).toContain(
			'give at least one of --graphql, --openapi, --rules',
		);
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

const STALE_RULES = `limix: 1
global:
  unmatched: deny
rest:
  "GET /notes":
    authenticated: true
  "DELETE /files/*":
    authenticated: true
graphql:
  Query.me:
    authenticated: true
  Query.you:
    authenticated: true
  "Nope.*":
    authenticated: true
`;
const STALE_LINES = [
	"rules.yaml: rest['DELETE /files/*'] applies to no operation of openapi.yaml (no DELETE route matches /files/*)\n",
	"rules.yaml: graphql['Query.you'] names no field of Query in schema.graphql\n",
	"rules.yaml: graphql['Nope.*'] names no type of schema.graphql\n",
];

describe('generate, stale rules', () => {
	// The rules file is read from disk, as before: write it to a real file.
	async function withRules<T>(
		text: string,
		body: (rules: string) => Promise<T>,
	): Promise<T> {
		const dir = await mkdtemp(join(tmpdir(), 'limix-codegen-'));
		try {
			const path = join(dir, 'rules.yaml');
			await Bun.write(path, text);
			return await body(path);
		} finally {
			await rm(dir, { recursive: true });
		}
	}
	const named = (lines: string[], rules: string) =>
		lines.map((line) => line.replace('rules.yaml:', `${rules}:`));

	it('warns on stderr, writes the file and exits 0 without --check', async () => {
		await withRules(STALE_RULES, async (rules) => {
			const t = fakeIo(INPUTS);
			const args = ['generate', ...FLAGS, '--rules', rules];
			expect(await run(args, t.io)).toBe(0);
			expect(t.files.has('gen.ts')).toBe(true);
			expect(t.err).toEqual(named(STALE_LINES, rules));
			expect(t.out).toEqual(['wrote gen.ts\n']);
		});
	});

	it('--check exits 1 with the messages and a count, writing nothing', async () => {
		await withRules(STALE_RULES, async (rules) => {
			const t = fakeIo(INPUTS);
			await run(['generate', ...FLAGS, '--rules', rules], t.io);
			t.err.length = 0;
			t.out.length = 0;
			const code = await run(
				['generate', ...FLAGS, '--rules', rules, '--check'],
				t.io,
			);
			expect(code).toBe(1);
			expect(t.err).toEqual([
				...named(STALE_LINES, rules),
				'3 stale rule(s): fix or remove them, or add the operation to the spec\n',
			]);
			expect(t.out).toEqual([]);
		});
	});

	it('--check reports an out-of-date file and the stale rules together', async () => {
		await withRules(STALE_RULES, async (rules) => {
			const t = fakeIo({ ...INPUTS, 'gen.ts': 'old\n' });
			const code = await run(
				['generate', ...FLAGS, '--rules', rules, '--check'],
				t.io,
			);
			expect(code).toBe(1);
			expect(t.err[0]).toBe(
				'gen.ts is out of date: run limix-codegen generate with the same flags and commit it\n',
			);
			expect(t.err).toHaveLength(5);
			expect(t.writes).toEqual([]);
		});
	});

	it('--check passes on rules that all reach an operation', async () => {
		await withRules(FIXTURE_RULES_YAML, async (rules) => {
			const t = fakeIo(INPUTS);
			await run(['generate', ...FLAGS, '--rules', rules], t.io);
			expect(t.err).toEqual([]);
			expect(
				await run(['generate', ...FLAGS, '--rules', rules, '--check'], t.io),
			).toBe(0);
			expect(t.out.at(-1)).toBe('gen.ts is up to date\n');
		});
	});

	it('judges nothing when only the rules are given', async () => {
		await withRules(STALE_RULES, async (rules) => {
			const t = fakeIo();
			expect(await run(['generate', '--rules', rules, '--check'], t.io)).toBe(
				1,
			);
			expect(t.err.join('')).not.toContain('stale');
			expect(t.err.join('')).not.toContain('applies to no operation');
		});
	});

	it('judges only the transport whose input is given', async () => {
		await withRules(STALE_RULES, async (rules) => {
			const t = fakeIo(INPUTS);
			await run(
				[
					'generate',
					'--openapi',
					'openapi.yaml',
					'--out',
					'g.ts',
					'--rules',
					rules,
				],
				t.io,
			);
			expect(t.err).toEqual(named(STALE_LINES.slice(0, 1), rules));
		});
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
	it('writes a starter once and leaves an existing file alone', async () => {
		const t = fakeIo(INPUTS);
		const args = [
			'init',
			'--graphql',
			'schema.graphql',
			'--openapi',
			'openapi.yaml',
			'--rules',
			'new.yaml',
		];
		expect(await run(args, t.io)).toBe(0);
		expect(t.out[0]).toBe('wrote new.yaml (6 operations, unmatched: deny)\n');
		const first = t.files.get('new.yaml');
		expect(first).toContain('unmatched: deny');
		expect(await run(args, t.io)).toBe(0);
		expect(t.err[0]).toContain(
			'new.yaml exists: init never rewrites a rules file',
		);
		expect(t.files.get('new.yaml')).toBe(first);
		expect(t.writes).toEqual(['new.yaml']);
	});

	it('writes JSON for a .json target and rules.yaml by default', async () => {
		const t = fakeIo(INPUTS);
		await run(['init', '--openapi', 'openapi.yaml', '--rules', 'r.json'], t.io);
		expect(t.files.get('r.json')?.startsWith('{')).toBe(true);
		await run(['init', '--openapi', 'openapi.yaml'], t.io);
		expect(t.files.has('rules.yaml')).toBe(true);
	});

	it('writes flat keys with --flat, in YAML and JSON', async () => {
		const t = fakeIo(INPUTS);
		const base = [
			'init',
			'--graphql',
			'schema.graphql',
			'--openapi',
			'openapi.yaml',
		];
		expect(await run([...base, '--flat', '--rules', 'f.yaml'], t.io)).toBe(0);
		const yaml = t.files.get('f.yaml') ?? '';
		expect(yaml).toContain('  "GET /notes":\n    authenticated: true');
		expect(yaml).toContain('  "Query.me":\n    authenticated: true');
		expect(await run([...base, '--flat', '--rules', 'f.json'], t.io)).toBe(0);
		expect(Object.keys(JSON.parse(t.files.get('f.json') ?? '').rest)).toContain(
			'DELETE /notes/:id',
		);
		expect(await run([...base, '--rules', 'n.yaml'], t.io)).toBe(0);
		expect(t.files.get('n.yaml')).toContain('  "/notes":\n    GET:');
	});

	it('refuses no input and an unknown extension with exit 2', async () => {
		const t = fakeIo(INPUTS);
		expect(await run(['init'], t.io)).toBe(2);
		expect(
			await run(
				['init', '--openapi', 'openapi.yaml', '--rules', 'r.txt'],
				t.io,
			),
		).toBe(2);
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
