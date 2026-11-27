import { describe, expect, test } from 'bun:test';
import { mutableSource } from '@softistx/limix';
import { claims, fixtureSchema, policy } from './schema.fixtures';
import { guarded, makeGuard } from './wrap';

const at = { type: 'Query', field: 'me', root: true };
const info = { fieldName: 'me', path: { prev: undefined, key: 'me' } } as never;
const call = [{}, {}, {}, info] as Parameters<ReturnType<typeof guarded>>;

describe('makeGuard', () => {
	test('a static policy is its own snapshot', () => {
		expect(
			makeGuard(
				{ policy, claims: () => claims.admin },
				fixtureSchema(),
			).snapshot(),
		).toBe(policy);
	});

	test('a source reports each withdrawal once', () => {
		const source = mutableSource(policy);
		let reports = 0;
		const guard = makeGuard(
			{
				policy: source,
				claims: () => claims.admin,
				onUnavailable: () => reports++,
			},
			fixtureSchema(),
		);
		guard.snapshot();
		source.swap(null);
		expect(guard.snapshot()).toBeNull();
		guard.snapshot();
		source.swap(policy);
		guard.snapshot();
		source.swap(null);
		guard.snapshot();
		expect(reports).toBe(2);
	});

	test('a source with no onUnavailable withdraws quietly', () => {
		expect(
			makeGuard(
				{ policy: mutableSource(), claims: () => claims.admin },
				fixtureSchema(),
			).snapshot(),
		).toBeNull();
	});
});

describe('guarded', () => {
	test('runs the original after an allowed decision, with its own arguments', async () => {
		const guard = makeGuard(
			{ policy, claims: () => claims.reader },
			fixtureSchema(),
		);
		const seen: unknown[] = [];
		const resolver = guarded(guard, at, (...args) => {
			seen.push(args[1]);
			return 'ok';
		});
		expect(await resolver({}, { a: 1 }, {}, info)).toBe('ok');
		expect(seen).toEqual([{ a: 1 }]);
	});

	test('does not run the original after a refusal', async () => {
		let ran = false;
		const guard = makeGuard(
			{ policy, claims: () => claims.anon },
			fixtureSchema(),
		);
		const resolver = guarded(guard, at, () => {
			ran = true;
		});
		await expect(resolver(...call)).rejects.toMatchObject({
			extensions: { status: 401 },
		});
		expect(ran).toBe(false);
	});

	test('falls back on the default resolver when there is no original', async () => {
		const guard = makeGuard(
			{ policy, claims: () => claims.reader },
			fixtureSchema(),
		);
		const resolver = guarded(guard, at, undefined);
		expect(await resolver({ me: 'from parent' }, {}, {}, info)).toBe(
			'from parent',
		);
	});

	test('passes a relations function the context', async () => {
		let given: unknown;
		const guard = makeGuard(
			{
				policy,
				claims: () => claims.reader,
				relations: (ctx) => {
					given = ctx;
					return { check: async () => [] };
				},
			},
			fixtureSchema(),
		);
		const ctx = { tag: 1 };
		await guarded(guard, at, () => 1)({}, {}, ctx, info);
		expect(given).toBe(ctx);
	});
});
