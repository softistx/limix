import { describe, expect, it } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
	compilePolicy,
	type definePolicy,
	evaluateRest,
} from '@softistx/limix';
import type { Operation } from '@softistx/limix/coverage';
import { starterPolicy } from './starter';

const root = new URL('../', import.meta.url).pathname;

const operations: Operation[] = [
	{ kind: 'rest', method: 'POST', path: '/notes' },
	{ kind: 'rest', method: 'GET', path: '/notes' },
	{ kind: 'rest', method: 'GET', path: '/notes' },
	{ kind: 'rest', method: 'DELETE', path: '/notes/:id' },
	{ kind: 'graphql', type: 'Query', field: 'me', root: true },
	{ kind: 'graphql', type: 'Query', field: 'all', root: true },
	{ kind: 'graphql', type: 'Mutation', field: 'createNote', root: true },
	{ kind: 'graphql', type: 'Note', field: 'body', root: false },
];

const rest = (method: string, path: string): Operation => ({
	kind: 'rest',
	method,
	path,
});

/** Runs the emitted source: the `rules` it exports, with a stub for the generated file. */
async function evaluated(text: string) {
	const dir = await mkdtemp(join(root, '.starter-'));
	try {
		await Bun.write(join(dir, 'generated', 'limix.ts'), '');
		await Bun.write(join(dir, 'policy.ts'), text);
		const module = await import(join(dir, 'policy.ts'));
		return module.rules as ReturnType<typeof definePolicy>;
	} finally {
		await rm(dir, { recursive: true });
	}
}

describe('starterPolicy', () => {
	it('writes a definePolicy call, nested by default, with the types import first', () => {
		expect(starterPolicy(operations)).toBe(
			`// Written once by limix-codegen init: every operation needs a signed-in caller until you write its rule.
import './generated/limix';
import { definePolicy } from '@softistx/limix';

export const rules = definePolicy({
	limix: 1,
	global: { unmatched: 'deny' },
	rest: {
		'/notes': {
			GET: { authenticated: true },
			POST: { authenticated: true },
		},
		'/notes/:id': {
			DELETE: { authenticated: true },
		},
	},
	graphql: {
		Query: {
			all: { authenticated: true },
			me: { authenticated: true },
		},
		Mutation: {
			createNote: { authenticated: true },
		},
	},
});
`,
		);
	});

	it('writes one key per operation with flat', () => {
		expect(starterPolicy(operations, { flat: true })).toBe(
			`// Written once by limix-codegen init: every operation needs a signed-in caller until you write its rule.
import './generated/limix';
import { definePolicy } from '@softistx/limix';

export const rules = definePolicy({
	limix: 1,
	global: { unmatched: 'deny' },
	rest: {
		'GET /notes': { authenticated: true },
		'POST /notes': { authenticated: true },
		'DELETE /notes/:id': { authenticated: true },
	},
	graphql: {
		'Query.all': { authenticated: true },
		'Query.me': { authenticated: true },
		'Mutation.createNote': { authenticated: true },
	},
});
`,
		);
	});

	it('imports the types as it is told', () => {
		expect(starterPolicy(operations, { types: '../gen/limix' })).toContain(
			"import '../gen/limix';",
		);
	});

	it('leaves non-root GraphQL fields out, and an absent transport', () => {
		expect(starterPolicy(operations)).not.toContain('\tNote: {');
		const restOnly = starterPolicy(operations.filter((o) => o.kind === 'rest'));
		expect(restOnly).not.toContain('graphql:');
		const gqlOnly = starterPolicy(
			operations.filter((o) => o.kind === 'graphql'),
		);
		expect(gqlOnly).not.toContain('rest:');
	});

	it('writes a policy that runs to the nested one, flat or not', async () => {
		const nested = await evaluated(starterPolicy(operations));
		const flat = await evaluated(starterPolicy(operations, { flat: true }));
		expect(flat).toEqual(nested);
		expect(Object.keys(nested.rest ?? {})).toEqual(['/notes', '/notes/:id']);
		expect(nested.rest?.['/notes']?.POST).toEqual({ authenticated: true });
		expect(Object.keys(nested.graphql ?? {})).toEqual(['Query', 'Mutation']);
		expect(compilePolicy(nested).restRoutes).toHaveLength(3);
	});

	it('keeps a path with a quote or a backslash, flat or not, and a line break nested', async () => {
		const path = '/a\\"b\'c';
		for (const flat of [false, true]) {
			const policy = await evaluated(
				starterPolicy([rest('GET', path)], { flat }),
			);
			expect(Object.keys(policy.rest ?? {})).toEqual([path]);
		}
		const broken = '/a\nb';
		const policy = await evaluated(starterPolicy([rest('GET', broken)]));
		expect(Object.keys(policy.rest ?? {})).toEqual([broken]);
	});

	it('writes a static segment before a capture and a capture before a wildcard', () => {
		const paths = ['/f/*rest', '/notes/:id', '/notes/new', '/notes'].map(
			(path) => rest('GET', path),
		);
		for (const flat of [false, true]) {
			const text = starterPolicy(paths, { flat });
			const order = [...text.matchAll(/^\t\t'(?:GET )?([^']+)':/gm)].map(
				(m) => m[1],
			);
			expect(order).toEqual(['/f/*rest', '/notes', '/notes/new', '/notes/:id']);
		}
	});

	it('lets a public rule on /notes/new win over /notes/:id', async () => {
		const text = starterPolicy([
			rest('GET', '/notes/:id'),
			rest('GET', '/notes/new'),
		]).replace(
			"'/notes/new': {\n\t\t\tGET: { authenticated: true }",
			"'/notes/new': {\n\t\t\tGET: { public: true }",
		);
		const policy = compilePolicy(await evaluated(text));
		const decision = await evaluateRest(policy, {
			method: 'GET',
			path: '/notes/new',
			claims: { authenticated: false },
		});
		expect(decision.allow).toBe(true);
	});

	it('names an operation the policy cannot hold, as a RulesError', () => {
		expect(() => starterPolicy([rest('GET', '/a(')])).toThrow('/a(');
	});
});
