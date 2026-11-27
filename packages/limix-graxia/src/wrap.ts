import {
	type CompiledPolicy,
	evaluateField,
	isPolicySource,
	outageReporter,
	type PolicyInput,
} from '@softistx/limix';
import { defaultFieldResolver, type GraphQLFieldResolver } from 'graphql';
import { claimsOf } from './claims';
import { governs } from './governs';
import type { LimixGraxiaOptions, RefusalAt } from './options';
import { refusalError } from './refusal';

type Resolver = GraphQLFieldResolver<unknown, unknown>;

/** What every guarded field of one schema shares. */
export interface Guard {
	readonly options: LimixGraxiaOptions<unknown>;
	/** The policy held now (one read per call), or `null` for a source holding none. */
	snapshot(): CompiledPolicy | null;
}

export function makeGuard(options: LimixGraxiaOptions<never>): Guard {
	const wide = options as unknown as LimixGraxiaOptions<unknown>;
	const { policy } = wide;
	if (!isPolicySource(policy)) return { options: wide, snapshot: () => policy };
	const report = outageReporter(wide.onUnavailable ?? (() => {}));
	return {
		options: wide,
		snapshot() {
			const held = policy.current();
			report(held);
			return held;
		},
	};
}

async function enforce(
	guard: Guard,
	held: CompiledPolicy | null,
	at: Required<RefusalAt>,
	call: Parameters<Resolver>,
): Promise<void> {
	const [parent, args, ctx, info] = call;
	const { options } = guard;
	const claims = await claimsOf(ctx, options.claims);
	const { relations } = options;
	const decision = await evaluateField(
		(held ?? options.policy) as PolicyInput,
		{
			type: at.type,
			field: at.field,
			root: at.root,
			claims,
			args: args as Record<string, unknown>,
			source: parent,
			info,
			relations: typeof relations === 'function' ? relations(ctx) : relations,
		},
	);
	if (!decision.allow)
		throw refusalError(decision.refusal, options.mapRefusal, at);
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
		if (held && !governs(held, at.type, at.field, at.root)) return run(...call);
		return enforce(guard, held, at, call).then(() => run(...call));
	};
}
