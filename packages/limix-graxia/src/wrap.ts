import {
	CODE_UNAVAILABLE,
	type CompiledPolicy,
	evaluateField,
	isLimixRefusal,
	isPolicySource,
	LimixRefusal,
	outageReporter,
} from '@softistx/limix';
import {
	defaultFieldResolver,
	type GraphQLFieldResolver,
	type GraphQLSchema,
} from 'graphql';
import { claimsOf, relationsOf } from './claims';
import { governs } from './governs';
import type { LimixGraxiaOptions, RefusalAt } from './options';
import { refusalError } from './refusal';
import { checkPolicy } from './setup-check';

type Resolver = GraphQLFieldResolver<unknown, unknown>;

/** What every guarded field of one schema shares. */
export interface Guard {
	readonly options: LimixGraxiaOptions<object>;
	/**
	 * The policy held now (one read per call): `null` for a source holding none,
	 * or a refusal (503, `policy-mismatch`) for a held policy that does not fit
	 * the schema, which a source never checked when it was swapped in.
	 */
	snapshot(): CompiledPolicy | LimixRefusal | null;
}

const fits = (policy: CompiledPolicy, schema: GraphQLSchema): boolean => {
	try {
		checkPolicy(policy, schema, 'allow');
		return true;
	} catch {
		return false;
	}
};

export function makeGuard(
	options: LimixGraxiaOptions<never>,
	schema: GraphQLSchema,
): Guard {
	const wide = options as LimixGraxiaOptions<object>;
	const { policy } = wide;
	if (!isPolicySource(policy)) return { options: wide, snapshot: () => policy };
	const report = outageReporter(wide.onUnavailable ?? (() => {}));
	const checked = new WeakMap<CompiledPolicy, boolean>();
	return {
		options: wide,
		snapshot() {
			const held = policy.current();
			if (held === null) {
				report(null);
				return null;
			}
			let ok = checked.get(held);
			if (ok === undefined) {
				ok = fits(held, schema);
				checked.set(held, ok);
			}
			report(ok ? held : null);
			return ok
				? held
				: new LimixRefusal(CODE_UNAVAILABLE, 503, {
						reason: 'policy-mismatch',
					});
		},
	};
}

async function enforce(
	guard: Guard,
	held: CompiledPolicy | LimixRefusal | null,
	at: Required<RefusalAt>,
	call: Parameters<Resolver>,
): Promise<void> {
	const [parent, args, ctx, info] = call;
	const { options } = guard;
	const top = info.path.prev === undefined;
	// Decided on this snapshot alone: a policy that lands while the claims are
	// read was never checked against the schema, so it must not judge this call.
	const policy =
		held ?? new LimixRefusal(CODE_UNAVAILABLE, 503, { reason: 'no-policy' });
	if (isLimixRefusal(policy))
		throw refusalError(policy, {
			mapRefusal: options.mapRefusal,
			at,
			topLevel: top,
		});
	const claims = await claimsOf(ctx, options.claims);
	const decision = await evaluateField(policy, {
		type: at.type,
		field: at.field,
		root: at.root,
		claims,
		args: args as Record<string, unknown>,
		source: parent,
		info,
		relations: relationsOf(ctx, options.relations),
	});
	if (!decision.allow)
		throw refusalError(decision.refusal, {
			mapRefusal: options.mapRefusal,
			at,
			topLevel: top,
		});
}

/**
 * The resolver (or `subscribe`) with the policy in front of it. A source that
 * holds a policy with no rule on the field, and the field not a root under
 * `deny`, passes straight through: no promise, no claims read.
 */
export function guarded(
	guard: Guard,
	at: Required<RefusalAt>,
	original: Resolver | undefined,
): Resolver {
	const run = original ?? defaultFieldResolver;
	return (...call) => {
		const held = guard.snapshot();
		if (
			held &&
			!isLimixRefusal(held) &&
			!governs(held, at.type, at.field, at.root)
		) {
			return run(...call);
		}
		return enforce(guard, held, at, call).then(() => run(...call));
	};
}
