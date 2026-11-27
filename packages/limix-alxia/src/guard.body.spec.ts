import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { fakeRelations, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

const rules = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/bookmarks': {
				POST: {
					authenticated: true,
					relations: [
						{
							require: [
								[{ relation: 'viewer', type: 'folder', from: 'json.folderId' }],
							],
						},
					],
				},
			},
		},
	}),
);

function build(relations = fakeRelations(['folder:f1'])) {
	const app = alxia();
	app.use(limixGuard({ policy: rules, claims: whoOf, relations, app }));
	app.post('/bookmarks', { bodyLimit: 60 }, async ({ request, reply }) =>
		reply(200, { seen: await request.json() }),
	);
	return { app, relations };
}
const post = (
	app: ReturnType<typeof build>['app'],
	body: string,
	type = 'application/json',
) =>
	app.fetch(
		new Request('http://localhost/bookmarks', {
			method: 'POST',
			headers: { 'content-type': type, 'x-who': 'reader' },
			body,
		}),
	);

describe('limixGuard, the JSON body', () => {
	test('a rule reading json. is judged by it, and the handler still reads the body', async () => {
		const { app } = build();
		const res = await post(app, '{"folderId":"f1"}');
		expect([res.status, await res.json()]).toEqual([
			200,
			{ seen: { folderId: 'f1' } },
		]);
		expect((await post(app, '{"folderId":"f2"}')).status).toBe(404);
	});

	test('a body that is no JSON, or not declared JSON, finds nothing: refused, handler untouched', async () => {
		const { app } = build();
		expect((await post(app, '{nope')).status).toBe(404);
		expect((await post(app, '{"folderId":"f1"}', 'text/plain')).status).toBe(
			404,
		);
	});

	test('a JSON body under text/json or application/x-json is judged too', async () => {
		const { app } = build();
		for (const type of ['text/json', 'application/x-json']) {
			expect((await post(app, '{"folderId":"f1"}', type)).status).toBe(200);
			expect((await post(app, '{"folderId":"f2"}', type)).status).toBe(404);
		}
	});

	test('a body over the route limit stays 413', async () => {
		const { app } = build();
		const res = await post(
			app,
			JSON.stringify({ folderId: 'f1', pad: 'x'.repeat(200) }),
		);
		expect(res.status).toBe(413);
	});
});
