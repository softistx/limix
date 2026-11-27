import { describe, expect, test } from 'bun:test';
import {
	type Claims,
	compilePolicy,
	definePolicy,
	mutableSource,
} from '@softistx/limix';
import { type ExecutionResult, parse, subscribe } from 'graphql';
import { guardSchema } from './guard';
import { claims, fixtureSchema, policy } from './schema.fixtures';

const document = parse('subscription { noteChanged(id: 1) { title } }');

async function open(schema: ReturnType<typeof fixtureSchema>, who: Claims) {
	return subscribe({ schema, document, contextValue: { who } });
}

const options = { claims: (ctx: { who: Claims }) => ctx.who };

describe('guardSchema, subscriptions', () => {
	test('a refusal at subscribe opens no stream', async () => {
		let started = false;
		const original = fixtureSchema();
		const field = original.getSubscriptionType()?.getFields()['noteChanged'];
		const inner = field?.subscribe;
		if (field) {
			field.subscribe = ((...call: unknown[]) => {
				started = true;
				return (inner as (...a: unknown[]) => unknown)(...call);
			}) as never;
		}
		const result = await open(
			guardSchema(original, { ...options, policy }),
			claims.anon,
		);
		expect(Symbol.asyncIterator in result).toBe(false);
		expect((result as ExecutionResult).errors?.[0]?.extensions).toMatchObject({
			code: 'auth.errors.unauthenticated',
			status: 401,
		});
		expect(started).toBe(false);
	});

	test('an allowed caller receives every event', async () => {
		const stream = await open(
			guardSchema(fixtureSchema(), { ...options, policy }),
			claims.reader,
		);
		const seen: unknown[] = [];
		for await (const event of stream as AsyncIterable<{ data: unknown }>)
			seen.push(event.data);
		expect(seen).toEqual([
			{ noteChanged: { title: 'A' } },
			{ noteChanged: { title: 'B' } },
		]);
	});

	test('each event is evaluated again: a refused one is null with an error and the stream goes on', async () => {
		const source = mutableSource(policy);
		const stream = (await open(
			guardSchema(fixtureSchema(), { ...options, policy: source }),
			claims.reader,
		)) as AsyncGenerator<{
			data?: unknown;
			errors?: { extensions: Record<string, unknown> }[];
		}>;
		expect((await stream.next()).value?.data).toEqual({
			noteChanged: { title: 'A' },
		});
		source.swap(
			compilePolicy(
				definePolicy({
					limix: 1,
					global: { unmatched: 'deny' },
					graphql: { Subscription: { noteChanged: { roles: [['admin']] } } },
				}),
			),
		);
		const second = (await stream.next()).value;
		expect(second?.data).toEqual({ noteChanged: null });
		expect(second?.errors?.[0]?.extensions).toMatchObject({ status: 403 });
		expect((await stream.next()).done).toBe(true);
	});

	test('the events see the payload as source', async () => {
		const seen: unknown[] = [];
		const withCondition = compilePolicy(
			definePolicy({
				limix: 1,
				global: { unmatched: 'allow' },
				graphql: {
					Subscription: {
						noteChanged: { authenticated: true, when: ['seen'] },
					},
				},
			}),
			{
				conditions: {
					seen: ({ source }) => {
						seen.push(source);
						return true;
					},
				},
			},
		);
		const stream = await open(
			guardSchema(fixtureSchema(), { ...options, policy: withCondition }),
			claims.reader,
		);
		for await (const _ of stream as AsyncIterable<unknown>) {
			// drain
		}
		expect(seen).toEqual([
			undefined,
			{ id: '1', title: 'A', body: 'ba' },
			{ id: '2', title: 'B', body: 'bb' },
		]);
	});
});
