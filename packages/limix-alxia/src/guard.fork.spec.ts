import { describe, expect, test } from 'bun:test';
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { call, ok, policy, whoOf } from './app.fixtures';
import { limixGuard } from './guard';

const small = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/open': { GET: { public: true } } },
	}),
);

describe('limixGuard and fork()', () => {
	test('a guard on the base that serves the routes of a fork answers 503 policy-mismatch', async () => {
		const base = alxia();
		base.use(limixGuard({ policy, claims: whoOf, app: base }));
		const fork = base.fork().get('/open', ok);
		const res = await call(fork, '/open');
		expect(res.status).toBe(503);
		expect(await res.json()).toMatchObject({
			params: { reason: 'policy-mismatch' },
		});
		expect(res.headers.get('retry-after')).toBe('5');
	});

	test('each fork carries its own guard, given the fork itself', async () => {
		const base = alxia();
		const fork = base.fork();
		fork.use(limixGuard({ policy: small, claims: whoOf, app: fork }));
		fork.get('/open', ok);
		expect((await call(fork, '/open')).status).toBe(200);
		expect((await call(fork, '/other')).status).toBe(404);
	});
});
