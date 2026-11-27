import type { Empty, RouteDefinition, SocketDefinition } from '@softistx/alxia';
import type {
	Claims,
	CompiledPolicy,
	PolicySource,
	RelationChecker,
} from '@softistx/limix';
import { isPolicySource } from '@softistx/limix';

/** The routes and sockets an app, or a group of it, declares: what `app.routes` and `app.sockets` give. */
export interface RoutesOf {
	readonly routes: readonly RouteDefinition[];
	readonly sockets?: readonly SocketDefinition[];
}

/** Why a request was refused: a limix refusal, or one the claims function threw (a `TenancyError`). */
export interface Refusal {
	readonly code: string;
	readonly status: number;
	readonly params: Readonly<Record<string, unknown>>;
}

/** What `mapRefusal` may change on the answer; `detail` is the problem's, or the JSON `message`. */
export interface RefusalAnswer {
	code?: string;
	status?: number;
	detail?: string;
}

export type MapRefusal<Ctx> = (
	refusal: Refusal,
	ctx: Ctx,
) => RefusalAnswer | Response | undefined;

export interface LimixAlxiaOptions<Ctx extends object = Empty> {
	/** The compiled rules, or a source that may hold none yet (fails closed). */
	policy: CompiledPolicy | PolicySource;
	/** Who is calling: read once per request that reaches a route. It may throw a refusal (a `TenancyError`). */
	claims: (ctx: Ctx) => Claims | Promise<Claims>;
	/** The relations port, or a function of the context, called once per request that needs it. */
	relations?: RelationChecker | ((ctx: Ctx) => RelationChecker);
	/** The app, or group, the guard is given to: its routes are checked against the rules. */
	app: RoutesOf;
	/** Rewords a refusal's code, status or detail, or answers with a `Response` of its own. */
	mapRefusal?: MapRefusal<Ctx>;
	/** Called once each time a policy source stops holding a policy, or holds one that does not fit the routes. */
	onUnavailable?: () => void;
}

/** Fails fast on a wiring mistake, naming the caller. */
export function checkOptions(
	caller: string,
	options: LimixAlxiaOptions<never>,
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
	const { app } = options;
	if (typeof app !== 'object' || app === null || !Array.isArray(app.routes)) {
		throw new TypeError(
			`${caller}: pass \`app\`, the alxia app (or group) the guard is used on`,
		);
	}
	if (
		options.mapRefusal !== undefined &&
		typeof options.mapRefusal !== 'function'
	) {
		throw new TypeError(`${caller}: \`mapRefusal\` is a function`);
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
}
