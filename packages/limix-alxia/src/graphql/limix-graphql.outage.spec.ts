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
import { mutableSource } from '@softistx/limix';
import { call, ok, whoOf } from '../app.fixtures';
import { limixGuard } from '../guard';
import { gqlPolicy, query, schema } from './graphql.fixtures';
import { limixGraphql } from './limix-graphql';

beforeEach(() => {
	spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => mock.restore());

function build() {
	const source = mutableSource(gqlPolicy);
	const calls = { n: 0 };
	const app = alxia();
	const limix = {
		policy: source,
		claims: whoOf,
		app,
		onUnavailable: () => calls.n++,
	};
	app.use(limixGuard(limix));
	app.get('/open', ok);
	limixGraphql(app, { schema: schema(), limix });
	return { app, source, calls };
}

describe('onUnavailable across REST and GraphQL', () => {
	test('one outage seen by a REST and a GraphQL request is reported once', async () => {
		const { app, source, calls } = build();
		source.swap(null);
		expect((await call(app, '/open')).status).toBe(503);
		expect((await query(app, '{ open }')).status).toBe(503);
		expect((await call(app, '/open')).status).toBe(503);
		expect(calls.n).toBe(1);
	});

	test('GraphQL first, then REST: still once', async () => {
		const { app, source, calls } = build();
		source.swap(null);
		await query(app, '{ open }');
		await call(app, '/open');
		expect(calls.n).toBe(1);
	});

	test('a policy back, then a second outage, is reported again', async () => {
		const { app, source, calls } = build();
		source.swap(null);
		await query(app, '{ open }');
		source.swap(gqlPolicy);
		await call(app, '/open');
		source.swap(null);
		await query(app, '{ open }');
		await call(app, '/open');
		expect(calls.n).toBe(2);
	});
});
