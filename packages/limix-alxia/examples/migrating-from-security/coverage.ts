import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { coverage } from '@softistx/limix/coverage';
import { alxiaOperations } from '@softistx/limix-alxia';
import { graphqlOperations } from '@softistx/limix-graxia/operations';

const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/notes/:id': { GET: { authenticated: true } } },
		graphql: { Query: { me: { authenticated: true } } },
	}),
);

const app = alxia().get('/notes/:id', ({ reply }) => reply(200, {}));

export const report = coverage(policy, [
	...alxiaOperations(app),
	...graphqlOperations('type Query { me: String }'),
]);

// Each is a list of labels such as `GET /notes/:id` or `Query.me`: assert both are empty.
export const uncovered = report.operations
	.filter((entry) => entry.status === 'uncovered')
	.map((entry) => entry.label);
export const stale = report.stale.map((rule) => rule.label);
