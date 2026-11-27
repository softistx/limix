import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { parseRules } from '@softistx/limix';
import { fencesOf, problemsOf } from './guide.fixtures';

// The guide lives in packages/limix/docs, its checked examples beside this
// spec: this is the one package that installs every integration, so it is the
// one that can compile and run them all.
const GUIDE = new URL(
	'../../limix/docs/migrating-from-security.md',
	import.meta.url,
);
const EXAMPLES = new URL(
	'../examples/migrating-from-security/',
	import.meta.url,
);

const fences = fencesOf(await Bun.file(GUIDE).text());
const checked = fences.filter((fence) => fence.marker?.endsWith('.ts'));
const exampleFiles = readdirSync(EXAMPLES).filter((name) =>
	name.endsWith('.ts'),
);
const fileOf = (name: string) => Bun.file(new URL(name, EXAMPLES)).text();

describe('the migration guide', () => {
	test('is found, and holds the checked TypeScript fences', () => {
		expect(checked.length).toBeGreaterThanOrEqual(8);
	});

	test('every fence has a known language, and a ts or yaml one a marker', () => {
		expect(problemsOf(fences)).toEqual([]);
	});

	test('every checked fence is a byte copy of its example file', async () => {
		for (const fence of checked) {
			const name = (fence.marker ?? '').replace('checked: ', '');
			const file = await fileOf(name);
			if (fence.body.trimEnd() !== file.trimEnd()) {
				throw new Error(
					`${name}: the fence at line ${fence.line} of the guide differs from the file`,
				);
			}
		}
	});

	test('every example file is named by exactly one fence', () => {
		const named = checked.map((fence) =>
			(fence.marker ?? '').replace('checked: ', ''),
		);
		expect([...named].sort()).toEqual([...exampleFiles].sort());
	});

	test('the "after" rules document parses, and is the one rules.ts writes in code', async () => {
		const documents = fences.filter(
			(fence) => fence.marker === 'checked: rules',
		);
		expect(documents.length).toBe(1);
		const parsed = parseRules(
			Bun.YAML.parse(documents[0]?.body ?? ''),
			'guide',
		);
		const { rules } = await import('../examples/migrating-from-security/rules');
		expect(parsed).toEqual(rules);
	});
});

describe('the examples run', () => {
	test('rules.ts compiles, with its relations and its condition', async () => {
		const { policy } = await import(
			'../examples/migrating-from-security/rules'
		);
		expect(policy.usesRelations).toBe(true);
	});

	test('hono.ts answers 401, 200 and 403 in the app error body', async () => {
		const { app } = await import('../examples/migrating-from-security/hono');
		const anonymous = await app.request('/api/notes/n1');
		expect(anonymous.status).toBe(401);
		expect(await anonymous.json()).toEqual({
			code: 'auth.errors.unauthenticated',
		});
		const headers = { authorization: 'Bearer u1' };
		const signedIn = await app.request('/api/notes/n1', { headers });
		expect(signedIn.status).toBe(200);
		expect(await signedIn.json()).toEqual({ id: 'n1' });
		const other = await app.request('/api/other', { headers });
		expect(other.status).toBe(403);
		expect(await other.json()).toEqual({ code: 'auth.errors.forbidden' });
	});

	test('hono.ts leaves the raw body readable for the handler', async () => {
		const { app } = await import('../examples/migrating-from-security/hono');
		const response = await app.request('/api/notes/n1', {
			method: 'POST',
			headers: {
				authorization: 'Bearer u1',
				'content-type': 'application/json',
			},
			body: JSON.stringify({ a: 1 }),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ raw: '{"a":1}' });
	});

	test('hono-coverage.ts lists the app routes: nothing uncovered, no rule stale', async () => {
		const { report, stale, uncovered } = await import(
			'../examples/migrating-from-security/hono-coverage'
		);
		expect(report.operations.map((entry) => entry.label)).toEqual([
			'GET /api/notes/:id',
			'POST /api/notes/:id',
		]);
		expect(uncovered).toEqual([]);
		expect(stale).toEqual([]);
	});

	test('alxia.ts judges a route with the same rules', async () => {
		const { app } = await import('../examples/migrating-from-security/alxia');
		const anonymous = await app.fetch(new Request('http://localhost/notes/1'));
		expect(anonymous.status).toBe(401);
		expect(await anonymous.json()).toMatchObject({
			code: 'auth.errors.unauthenticated',
		});
		const signedIn = await app.fetch(
			new Request('http://localhost/notes/1', {
				headers: { authorization: 'Bearer x' },
			}),
		);
		expect(signedIn.status).toBe(200);
	});

	test('coverage.ts leaves nothing uncovered and no rule stale', async () => {
		const { stale, uncovered } = await import(
			'../examples/migrating-from-security/coverage'
		);
		expect(uncovered).toEqual([]);
		expect(stale).toEqual([]);
	});

	test('sources.ts holds the policy fixed, and swappable', async () => {
		const { fixed, live } = await import(
			'../examples/migrating-from-security/sources'
		);
		expect(fixed.current()).not.toBeNull();
		expect(live.current()).toBe(fixed.current());
	});

	test('remote.ts starts no pull on import, and builds a source on call', async () => {
		const { rulesFromServer } = await import(
			'../examples/migrating-from-security/remote'
		);
		const realFetch = globalThis.fetch;
		// The pull starts at construction: keep it off the network.
		globalThis.fetch = (() =>
			Promise.reject(new Error('offline'))) as unknown as typeof fetch;
		try {
			const source = rulesFromServer(() => 'token');
			source.stop();
			expect(source.current()).toBeNull();
		} finally {
			globalThis.fetch = realFetch;
		}
	});

	test('load.ts reads the "after" rules file and compiles it with the condition', async () => {
		const { loadPolicy } = await import(
			'../examples/migrating-from-security/load'
		);
		const document = fences.find((fence) => fence.marker === 'checked: rules');
		const path = `${tmpdir()}/limix-migration-guide-${process.pid}.yaml`;
		await Bun.write(path, document?.body ?? '');
		const previous = process.env['RULES_FILE'];
		process.env['RULES_FILE'] = path;
		try {
			expect((await loadPolicy()).usesRelations).toBe(true);
		} finally {
			if (previous === undefined) delete process.env['RULES_FILE'];
			else process.env['RULES_FILE'] = previous;
			await rm(path, { force: true });
		}
	});

	test('graxia.ts refuses an anonymous { me } with 401 and answers a signed-in one', async () => {
		const { graxia } = await import(
			'../examples/migrating-from-security/graxia'
		);
		const post = (headers: Record<string, string>) =>
			graxia.fetch(
				new Request('http://localhost/graphql', {
					method: 'POST',
					headers: { 'content-type': 'application/json', ...headers },
					body: JSON.stringify({ query: '{ me }' }),
				}),
			);
		const anonymous = await post({});
		expect(anonymous.status).toBe(401);
		expect(JSON.stringify(await anonymous.json())).toContain(
			'auth.errors.unauthenticated',
		);
		expect((await post({ authorization: 'Bearer x' })).status).toBe(200);
	});
});
