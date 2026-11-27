import { describe, expect, test } from 'bun:test';
import { alxia, defineMiddleware } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { ok } from './app.fixtures';
import { limixGuard } from './guard';

const rules = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/t/:tenant/reports': { GET: { roles: [['analyst']] } } },
	}),
);

/** What a tenancy layer gives: a lazy scope that refuses an unknown tenant as a `TenancyError` does. */
const tenancy = defineMiddleware(async (ctx, next) => {
	const tenant = ctx.pathParams['tenant'] ?? '';
	return next({
		scope: () => {
			if (tenant === 'ghost') {
				throw Object.assign(new Error('unknown'), {
					code: 'tenancy.errors.unknown-tenant',
					status: 404,
					params: { tenant },
				});
			}
			return { tenant };
		},
	});
});

function build() {
	const app = alxia().use(tenancy);
	app.use(
		limixGuard({
			policy: rules,
			// The scope reaches limix only through the claims the host builds.
			claims: (ctx: { scope: () => { tenant: string } }) => ({
				authenticated: true,
				roles: ctx.scope().tenant === 'acme' ? ['analyst'] : [],
			}),
			app,
		}),
	);
	app.get('/t/:tenant/reports', ok);
	return app;
}
const get = (path: string) =>
	build().fetch(new Request(`http://localhost${path}`));

describe('limixGuard, tenancy', () => {
	test('the scope a layer before the guard resolved decides the claims', async () => {
		expect((await get('/t/acme/reports')).status).toBe(200);
		expect((await get('/t/other/reports')).status).toBe(403);
	});

	test('a TenancyError thrown while the claims resolve the scope is answered with its own code and status', async () => {
		const res = await get('/t/ghost/reports');
		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({
			code: 'tenancy.errors.unknown-tenant',
			params: { tenant: 'ghost' },
		});
	});
});
