import {
	createMemoryRelations,
	defineModel,
	permissions,
	type RelationStore,
} from '@softistx/janus/permissions';
import { compilePolicy, definePolicy } from '@softistx/limix';

export const model = defineModel({
	subjects: ['user'],
	types: {
		document: {
			related: { viewers: ['user'], editors: ['user'] },
			permits: { view: ['viewers', 'edit'], edit: ['editors'] },
		},
	},
});

export const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: {
			'/documents/:id': {
				GET: {
					relations: [{ require: [[{ relation: 'view', type: 'document' }]] }],
				},
				PUT: {
					relations: [
						{ require: [[{ relation: 'view', type: 'document' }]] },
						{
							require: [[{ relation: 'edit', type: 'document' }]],
							onDeny: 'FORBIDDEN',
						},
					],
				},
			},
		},
		graphql: {
			Query: {
				document: {
					relations: [{ require: [[{ relation: 'view', type: 'document' }]] }],
				},
			},
		},
	}),
);

export const ada = { type: 'user' as const, id: 'ada' };
export const bob = { type: 'user' as const, id: 'bob' };

/** A memory store, with ada an editor and bob a viewer of document d1. */
export async function seeded(store: RelationStore = createMemoryRelations()) {
	const access = permissions({ model, store });
	await access.grant({ type: 'document', id: 'd1' }, 'editors', ada);
	await access.grant({ type: 'document', id: 'd1' }, 'viewers', bob);
	return access;
}
