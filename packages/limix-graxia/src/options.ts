import type {
	Claims,
	CompiledPolicy,
	LimixRefusal,
	PolicySource,
	RelationChecker,
} from '@softistx/limix';
import { isPolicySource } from '@softistx/limix';

/** Where a refusal happened: the field, and whether it is an operation root field. */
export interface RefusalAt {
	type: string;
	field: string;
	root?: boolean;
}

/** What `mapRefusal` may change on a refusal's GraphQL error. */
export interface RefusalAnswer {
	code?: string;
	message?: string;
	status?: number;
}

export type MapRefusal = (
	refusal: LimixRefusal,
	at: RefusalAt,
) => RefusalAnswer | undefined;

export interface LimixGraxiaOptions<Ctx = never> {
	/** The compiled rules, or a source that may hold none yet (fails closed). */
	policy: CompiledPolicy | PolicySource;
	/** Who is calling, read once per request context. */
	claims: (ctx: Ctx) => Claims | Promise<Claims>;
	/** The relations port, or a function of the context. */
	relations?: RelationChecker | ((ctx: Ctx) => RelationChecker);
	/** Rewords a refusal's code, message or status. */
	mapRefusal?: MapRefusal;
	/** A named field that is non-null would turn a refusal into a null parent: `'refuse'` (default) rejects it at `guardSchema`. */
	nonNull?: 'refuse' | 'allow';
	/** Called once each time a policy source stops holding a policy. */
	onUnavailable?: () => void;
}

/** Fails fast on a wiring mistake, naming the caller. */
export function checkOptions(
	caller: string,
	options: LimixGraxiaOptions<never>,
): void {
	if (typeof options !== 'object' || options === null) {
		throw new TypeError(`${caller}: pass the options`);
	}
	const { policy } = options;
	if (typeof policy !== 'object' || policy === null) {
		throw new TypeError(
			`${caller}: pass \`policy\`, a compiled policy or a policy source`,
		);
	}
	if (!isPolicySource(policy) && !('global' in policy)) {
		throw new TypeError(
			`${caller}: \`policy\` is neither a compiled policy (compilePolicy(...)) nor a policy source`,
		);
	}
	if (typeof options.claims !== 'function') {
		throw new TypeError(
			`${caller}: pass \`claims\`, a function of the context returning the caller's claims`,
		);
	}
	if (
		!isPolicySource(policy) &&
		policy.usesRelations &&
		options.relations === undefined
	) {
		throw new TypeError(
			`${caller}: the rules use relations; pass \`relations\`, a RelationChecker (janusRelations() from @softistx/limix-janus) or a function of the context returning one`,
		);
	}
	const { nonNull } = options;
	if (nonNull !== undefined && nonNull !== 'refuse' && nonNull !== 'allow') {
		throw new TypeError(`${caller}: \`nonNull\` is 'refuse' or 'allow'`);
	}
}
