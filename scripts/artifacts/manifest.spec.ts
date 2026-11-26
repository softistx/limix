import { describe, expect, test } from 'bun:test';
import { accessProblems, manifestShapeProblems } from './manifest';

describe('manifestShapeProblems', () => {
	const adapter = (
		peerDependencies: Record<string, string>,
		name = '@softistx/janus-mongo',
	) => ({
		name,
		peerDependencies,
	});

	test('accepts a caret range on a sibling', () => {
		expect(
			manifestShapeProblems([
				{ name: '@softistx/janus' },
				adapter({ '@softistx/janus': '^0.2.0' }),
			]),
		).toEqual([]);
	});

	test('refuses an exact pin on a sibling: two copies, two StoreFailure classes', () => {
		const problems = manifestShapeProblems([
			{ name: '@softistx/janus' },
			adapter({ '@softistx/janus': '0.2.0' }),
		]);
		expect(problems).toEqual([
			expect.stringContaining('pins a sibling exactly'),
		]);
	});

	test('refuses a package that lists itself', () => {
		const problems = manifestShapeProblems([
			{ name: '@softistx/janus', dependencies: { '@softistx/janus': '.' } },
		]);
		expect(problems).toEqual([expect.stringContaining('lists itself')]);
	});

	/** `bun pm pack` resolves every `workspace:`; one left means it did not. */
	test('refuses a workspace: left in a field a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{ name: '@softistx/janus' },
				{
					name: '@softistx/janus-mongo',
					peerDependencies: { '@softistx/janus': 'workspace:^' },
					devDependencies: { '@softistx/janus': 'workspace:^' },
				},
			]),
		).toEqual([
			'@softistx/janus-mongo: peerDependencies.@softistx/janus = workspace:^, ' +
				'which `bun pm pack` should have resolved',
		]);
	});

	test('refuses link: and file: where a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@softistx/janus',
					dependencies: { a: 'link:../a' },
					optionalDependencies: { b: 'file:../b' },
					devDependencies: { c: 'link:../c' },
				},
			]),
		).toEqual([
			'@softistx/janus: dependencies.a = link:../a',
			'@softistx/janus: optionalDependencies.b = file:../b',
		]);
	});
});

describe('accessProblems', () => {
	test('accepts a package public on registry.npmjs.org', () => {
		expect(
			accessProblems({
				name: '@softistx/janus',
				publishConfig: {
					registry: 'https://registry.npmjs.org/',
					access: 'restricted',
				},
			}),
		).toEqual([]);
	});

	test('refuses a package published as restricted on another registry', () => {
		expect(
			accessProblems({
				name: '@softistx/janus',
				publishConfig: {
					registry: 'https://registry.example.test/',
					access: 'restricted',
				},
			}),
		).toHaveLength(1);
	});

	test('refuses a package with no publishConfig', () => {
		expect(accessProblems({ name: '@softistx/janus' })).toHaveLength(1);
	});
});
