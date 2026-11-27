import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from 'bun:test';
import { alxia } from '@softistx/alxia';
import {
	compilePolicy,
	definePolicy,
	mutableSource,
	staticSource,
} from '@softistx/limix';
import {
	allowAll,
	call,
	guardedApp,
	ok,
	policy,
	whoOf,
	withRelations,
} from './app.fixtures';
import { limixGuard } from './guard';

const ghost = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'allow' },
		rest: { '/ghost': { GET: { public: true } } },
	}),
);
beforeEach(() => {
	spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => mock.restore());

describe('limixGuard, policy source', () => {
	test('holds no policy: 503 no-policy with retry-after, claims never read, onUnavailable once', async () => {
		const source = mutableSource();
		let reports = 0;
		let reads = 0;
		const app = guardedApp({
			policy: source,
			claims: (ctx) => {
				reads++;
				return whoOf(ctx);
			},
			onUnavailable: () => reports++,
		});
		const first = await call(app, '/open');
		expect(first.status).toBe(503);
		expect(first.headers.get('retry-after')).toBe('5');
		expect(await first.json()).toEqual({
			code: 'limix.errors.unavailable',
			params: { reason: 'no-policy' },
		});
		await call(app, '/me');
		expect([reports, reads]).toEqual([1, 0]);
		source.swap(policy);
		expect((await call(app, '/open')).status).toBe(200);
		source.swap(null);
		await call(app, '/open');
		expect(reports).toBe(2);
	});

	test('a problem app answers 503 as a problem', async () => {
		const app = guardedApp({ policy: mutableSource() }, 'problem');
		const res = await call(app, '/open');
		expect(res.status).toBe(503);
		expect(res.headers.get('content-type')).toContain(
			'application/problem+json',
		);
		expect(res.headers.get('retry-after')).toBe('5');
	});

	test('follows a swap without a new app', async () => {
		const source = mutableSource(policy);
		const app = guardedApp({ policy: source });
		expect((await call(app, '/me')).status).toBe(401);
		source.swap(allowAll);
		expect((await call(app, '/me')).status).toBe(200);
	});

	test('a policy swapped in that fits no route is 503 policy-mismatch, once reported, until a fitting one comes', async () => {
		const source = mutableSource(allowAll);
		let reports = 0;
		const app = guardedApp({ policy: source, onUnavailable: () => reports++ });
		expect((await call(app, '/me')).status).toBe(200);
		source.swap(ghost);
		const refused = await call(app, '/me');
		expect(refused.status).toBe(503);
		expect(await refused.json()).toMatchObject({
			params: { reason: 'policy-mismatch' },
		});
		await call(app, '/open');
		expect(reports).toBe(1);
		source.swap(policy);
		expect((await call(app, '/me')).status).toBe(401);
	});

	test('a static policy that does not fit the routes answers 503 policy-mismatch on the first request', async () => {
		const app = alxia();
		app.use(limixGuard({ policy, claims: whoOf, app }));
		app.get('/open', ok);
		const res = await call(app, '/open');
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({
			params: { reason: 'policy-mismatch' },
		});
	});

	test('a static source behaves as its policy', async () => {
		const app = guardedApp({ policy: staticSource(policy) });
		expect((await call(app, '/open')).status).toBe(200);
		expect((await call(app, '/me')).status).toBe(401);
	});

	test('a source with relations and no checker is the core 503 no-relation-checker', async () => {
		const app = alxia();
		app.use(
			limixGuard({ policy: mutableSource(withRelations), claims: whoOf, app }),
		);
		app.get('/notes/:id', ({ reply }) => reply(200, {}));
		const res = await call(app, '/notes/1', { who: 'reader' });
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({
			code: 'limix.errors.unavailable',
			params: { reason: 'no-relation-checker' },
		});
	});
});
