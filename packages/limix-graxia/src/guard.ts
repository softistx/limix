import type { Empty } from '@softistx/graxia';
import { isPolicySource } from '@softistx/limix';
import type { GraphQLSchema } from 'graphql';
import { governs, rootNames } from './governs';
import { checkOptions, type LimixGraxiaOptions } from './options';
import { rebuildSchema } from './rebuild';
import { checkPolicy } from './setup-check';
import { guarded, makeGuard } from './wrap';

const made = new WeakSet<GraphQLSchema>();

/** Whether `guardSchema` produced this schema. */
export const isGuarded = (schema: GraphQLSchema): boolean => made.has(schema);

/**
 * A copy of the schema whose fields answer to the policy: a refused field throws
 * a GraphQL error carrying the refusal's code and status. Pass the result, never
 * the original, to `createGraxia()`. A static policy is checked against the schema
 * here and only the fields it decides are wrapped; a policy source wraps every
 * object field (a field with no rule passes straight through at run time).
 */
export function guardSchema<Ctx extends object = Empty>(
	schema: GraphQLSchema,
	options: LimixGraxiaOptions<Ctx>,
): GraphQLSchema {
	const wide: LimixGraxiaOptions<never> = options;
	checkOptions('guardSchema()', wide);
	if (made.has(schema)) {
		throw new TypeError('guardSchema(): this schema is already guarded');
	}
	const { policy } = wide;
	const fixed = isPolicySource(policy) ? undefined : policy;
	if (fixed) checkPolicy(fixed, schema, wide.nonNull ?? 'refuse');
	const roots = rootNames(schema);
	const subscription = schema.getSubscriptionType()?.name;
	const guard = makeGuard(wide, schema);
	const next = rebuildSchema(schema, (type, field, config) => {
		const root = roots.has(type.name);
		if (fixed && !governs(fixed, type.name, field, root)) return config;
		const at = { type: type.name, field, root };
		return {
			...config,
			resolve: guarded(guard, at, config.resolve),
			...(type.name === subscription
				? { subscribe: guarded(guard, at, config.subscribe) }
				: {}),
		};
	});
	made.add(next);
	return next;
}
