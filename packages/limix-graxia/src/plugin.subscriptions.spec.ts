import { describe, expect, test } from 'bun:test';
import { createGraxia } from '@softistx/graxia';
import {
	type CompiledPolicy,
	LimixRefusal,
	mutableSource,
	type PolicySource,
} from '@softistx/limix';
import { guardSchema } from './guard';
import { limixGraxia } from './plugin';
import { claims, fixtureSchema, policy } from './schema.fixtures';

function server(
	source: CompiledPolicy | PolicySource = policy,
	schema = fixtureSchema(),
) {
	const options = {
		policy: source,
		claims: (ctx: { request: Request }) =>
			ctx.request.headers.get('x-user') === null ? claims.anon : claims.reader,
	};
	return createGraxia({
		schema: guardSchema(schema, options),
		plugins: [limixGraxia(options)],
		context: ({ request }: { request: Request }) => ({ request }),
		onUnexpected: false,
	});
}

const sse = (
	graxia: ReturnType<typeof server>,
	headers: Record<string, string> = {},
) =>
	graxia.fetch(
		new Request('http://graxia.test/graphql', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				accept: 'text/event-stream',
				...headers,
			},
			body: JSON.stringify({
				query: 'subscription { noteChanged(id: 1) { title } }',
			}),
		}),
	);

describe('limixGraxia(), subscriptions over SSE', () => {
	test('an allowed caller receives each event', async () => {
		const response = await sse(server(), { 'x-user': '1' });
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('"noteChanged":{"title":"A"}');
		expect(text).toContain('"noteChanged":{"title":"B"}');
	});

	test('a refusal at subscribe is sent as an error, with no event', async () => {
		const response = await sse(server());
		expect(response.status).toBe(401);
		const text = await response.text();
		expect(text).toContain('auth.errors.unauthenticated');
		expect(text).not.toContain('"title"');
	});

	test('no policy held refuses the subscription as unavailable', async () => {
		const text = await (
			await sse(server(mutableSource()), { 'x-user': '1' })
		).text();
		expect(text).toContain('limix.errors.unavailable');
	});

	test('a refusal a resolver throws inside an event is remapped, and the stream goes on', async () => {
		const schema = fixtureSchema();
		const field = schema.getSubscriptionType()?.getFields()['noteChanged'];
		let seen = 0;
		if (field) {
			field.resolve = ((payload: unknown) => {
				if (seen++ === 0) throw new LimixRefusal('auth.errors.forbidden', 403);
				return payload;
			}) as never;
		}
		const text = await (
			await sse(server(policy, schema), { 'x-user': '1' })
		).text();
		expect(text).toContain('"code":"auth.errors.forbidden"');
		expect(text).toContain('"status":403');
		expect(text).toContain('"noteChanged":{"title":"B"}');
	});
});
