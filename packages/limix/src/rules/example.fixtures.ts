import { definePolicy } from './define';

/** The same document, written as YAML and through the builder. */
export const EXAMPLE_YAML = `
limix: 1
x-admin: &admin
  roles: [[admin]]
global:
  basePath: /api
  unmatched: deny
rest:
  /documents:
    GET:
      authenticated: true
  /documents/:id:
    PUT:
      permissions: [[documents:write], [documents:admin, audit:read]]
      when: [workingHours]
      relations:
        - require: [[{ relation: view, type: document, from: param.id }]]
        - require: [[{ relation: edit, type: document, from: param.id }]]
          onDeny: FORBIDDEN
    DELETE: *admin
  /health:
    GET:
      public: true
graphql:
  Query:
    me:
      authenticated: true
  Mutation:
    updateNote:
      roles: [[editor, reviewer], [admin]]
      relations:
        - require: [[{ relation: edit, type: note, from: args.id }]]
          onDeny: FORBIDDEN
`;

export const EXAMPLE_POLICY = definePolicy({
	limix: 1,
	global: { basePath: '/api', unmatched: 'deny' },
	rest: {
		'/documents': { GET: { authenticated: true } },
		'/documents/:id': {
			PUT: {
				permissions: [['documents:write'], ['documents:admin', 'audit:read']],
				when: ['workingHours'],
				relations: [
					{
						require: [
							[{ relation: 'view', type: 'document', from: 'param.id' }],
						],
					},
					{
						require: [
							[{ relation: 'edit', type: 'document', from: 'param.id' }],
						],
						onDeny: 'FORBIDDEN',
					},
				],
			},
			DELETE: { roles: [['admin']] },
		},
		'/health': { GET: { public: true } },
	},
	graphql: {
		Query: { me: { authenticated: true } },
		Mutation: {
			updateNote: {
				roles: [['editor', 'reviewer'], ['admin']],
				relations: [
					{
						require: [[{ relation: 'edit', type: 'note', from: 'args.id' }]],
						onDeny: 'FORBIDDEN',
					},
				],
			},
		},
	},
});
