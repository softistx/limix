import { compilePolicy, definePolicy } from '@softistx/limix';

export const rules = definePolicy({
	limix: 1,
	global: { unmatched: 'deny' },
	rest: {
		'/notes/:id': {
			GET: { roles: [['USER'], ['ADMIN']] },
			DELETE: { roles: [['ADMIN', 'AUDIT']] },
			PATCH: { when: ['secondFactor'] },
		},
		'/bookmarks/:id': {
			GET: {
				relations: [
					{
						require: [
							[{ relation: 'view', type: 'bookmark', from: 'param.id' }],
						],
						code: 'auth.errors.bookmark-not-found',
					},
				],
			},
		},
	},
	graphql: { Query: { me: { authenticated: true } } },
});

export const policy = compilePolicy(rules, {
	conditions: { secondFactor: ({ claims }) => claims['aal'] === 'aal2' },
});
