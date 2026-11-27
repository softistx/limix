import type { Alxia, Empty, RoutePath } from '@softistx/alxia';
import {
	type GraphQLOptions,
	graphql,
	type ServerContext,
} from '@softistx/alxia-graphql';
import type { ContextOf, CoreContext, GraxiaPlugin } from '@softistx/graxia';
import { isPolicySource } from '@softistx/limix';
import {
	guardSchema,
	type LimixGraxiaOptions,
	limixGraxia,
	type MapRefusal,
} from '@softistx/limix-graxia';
import { registerEndpoints } from '../endpoints';
import { checkOptions, type LimixAlxiaOptions } from '../options';
import { outageOf } from '../outage';
import { rungCodeProblems } from '../setup-check';

/** graphql()'s own bound on `plugins`: a plugin of any context. */
// biome-ignore lint/suspicious/noExplicitAny: the bound graphql() declares, which a narrower one would refuse plugins of
type AnyPlugins = readonly GraxiaPlugin<any, any>[];

/** What `limixGraphql` adds to graphql()'s options. */
export interface LimixGraphqlExtras<Ctx extends object> {
	/**
	 * What the field guard reads: `limix` gives it its policy, claims, relations
	 * and outage state. Every `limixGuard` of the app leaves the endpoint to it,
	 * whichever options that guard got.
	 */
	limix: LimixAlxiaOptions<ServerContext<Ctx>>;
	/** Rewords a refused field's GraphQL error (limix-graxia's `mapRefusal`; the REST `mapRefusal` is not used here). */
	mapRefusal?: MapRefusal;
	/** A named field that is non-null would turn a refusal into a null parent: `'refuse'` (default) rejects it. */
	nonNull?: 'refuse' | 'allow';
}

export type LimixGraphqlOptions<
	Ctx extends object,
	Path extends RoutePath,
	SchemaCtx,
	Made extends object,
	Plugins extends AnyPlugins,
> = GraphQLOptions<Ctx, Path, SchemaCtx, Made, Plugins> &
	LimixGraphqlExtras<Ctx>;

/** graphql()'s own check: the schema's resolvers read nothing the app does not build. */
type ProvidesContext<Provided, Required> = Provided extends Required
	? unknown
	: {
			readonly schema: `the schema's resolvers read a context the app does not build: missing ${Exclude<keyof Required, keyof Provided> & string}`;
		};

/** What the field guard of limix-graxia takes, read off the guard's options. */
function graxiaOptions<Ctx extends object>({
	limix,
	mapRefusal,
	nonNull,
}: LimixGraphqlExtras<Ctx>): LimixGraxiaOptions<ServerContext<Ctx>> {
	return {
		policy: outageOf(limix).watch(limix.policy),
		claims: limix.claims,
		...(limix.relations === undefined ? {} : { relations: limix.relations }),
		// One outage for REST and GraphQL: limix-graxia reports through the state
		// the REST guard of the same options feeds, so `onUnavailable` runs once.
		onUnavailable: () => outageOf(limix).graphql(),
		...(mapRefusal === undefined ? {} : { mapRefusal }),
		...(nonNull === undefined ? {} : { nonNull }),
	};
}

/**
 * `graphql(app, options)` with the policy in front of every field: the schema
 * goes through limix-graxia's `guardSchema` and its plugin, the claims are read
 * once per operation, and the endpoint the call declares is left to that field
 * guard by `limixGuard` and left out of `alxiaOperations` (the rules for
 * `Query.field` judge it, not a REST rule for `POST /graphql`). Give it the
 * `limix` options object `limixGuard` has.
 */
export function limixGraphql<
	Ctx extends object,
	Prefix extends string,
	SchemaCtx,
	Made extends object = Empty,
	const Path extends RoutePath = '/graphql',
	const Plugins extends AnyPlugins = AnyPlugins,
>(
	app: Alxia<Ctx, Prefix>,
	options: LimixGraphqlOptions<Ctx, Path, SchemaCtx, Made, Plugins> &
		ProvidesContext<
			CoreContext & ServerContext<Ctx> & Made & ContextOf<Plugins>,
			SchemaCtx
		>,
): Alxia<Ctx, Prefix> {
	const { limix, mapRefusal: _, nonNull: __, ...rest } = options;
	checkOptions('limixGraphql()', limix);
	if (!isPolicySource(limix.policy)) {
		const problems = rungCodeProblems(limix.policy);
		if (problems.length > 0) {
			throw new TypeError(
				`limixGraphql(): the policy does not fit:\n- ${problems.join('\n- ')}`,
			);
		}
	}
	const wanted = graxiaOptions(options);
	const routes = [...app.routes];
	const sockets = [...app.sockets];
	// graphql() checks the schema's context against the plugins' by a conditional
	// type that cannot be resolved for a generic `Ctx`: the signature above has
	// already applied the same check to what the caller wrote.
	const made = graphql(app, {
		...rest,
		schema: guardSchema(rest.schema, wanted),
		plugins: [limixGraxia(wanted), ...(rest.plugins ?? [])],
	} as never);
	registerEndpoints(
		app.routes.filter((route) => !routes.includes(route)),
		app.sockets.filter((socket) => !sockets.includes(socket)),
	);
	return made;
}
