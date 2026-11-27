import type { Claims, RelationChecker } from '@softistx/limix';

/** What the plugin adds to the context: the caller's claims, read once per operation. */
export interface LimixContext {
	limix: { claims(): Promise<Claims> };
}

function checked(value: unknown): Claims {
	if (typeof value !== 'object' || value === null) {
		throw new TypeError(
			'limix-graxia: `claims` must return a claims object ({ authenticated: boolean, ... })',
		);
	}
	return value as Claims;
}

/** One read of the claims, shared by every field of a request. */
export function onceClaims(
	read: () => Claims | Promise<Claims>,
): () => Promise<Claims> {
	let held: Promise<Claims> | undefined;
	return () => {
		held ??= (async () => checked(await read()))();
		return held;
	};
}

/** Marks the object the plugin put on the context, so a `ctx.limix` of anyone else is never trusted. */
const BRAND: unique symbol = Symbol.for('limix-graxia.context');

interface Branded {
	[BRAND]: { relations(): RelationChecker | undefined };
}

/** The `limix` object the plugin adds, or `undefined` for any other `ctx.limix`. */
function madeBy(ctx: unknown): (LimixContext['limix'] & Branded) | undefined {
	if (typeof ctx !== 'object' || ctx === null) return undefined;
	const added = (ctx as Partial<LimixContext>).limix;
	return typeof added === 'object' && added !== null && BRAND in added
		? (added as LimixContext['limix'] & Branded)
		: undefined;
}

/**
 * What the plugin adds to one operation's context: the claims and the relations
 * checker, each read once however many fields ask.
 */
export function pluginContext(
	claims: () => Claims | Promise<Claims>,
	relations: () => RelationChecker | undefined,
): LimixContext {
	let checker: { held: RelationChecker | undefined } | undefined;
	const limix = {
		claims: onceClaims(claims),
		[BRAND]: {
			relations: () => {
				checker ??= { held: relations() };
				return checker.held;
			},
		},
	};
	return { limix };
}

/**
 * The claims of a context: the plugin's `ctx.limix.claims()` (one read per
 * operation) when it made the context, else `read(ctx)` on every call, never
 * memoised, since a host may reuse one context object for several callers.
 */
export function claimsOf<Ctx>(
	ctx: unknown,
	read: (ctx: Ctx) => Claims | Promise<Claims>,
): Promise<Claims> {
	const made = madeBy(ctx);
	if (made) return made.claims();
	return Promise.resolve().then(() => checked(read(ctx as Ctx)));
}

/** The relations checker of a context: the plugin's once-per-operation one, else the option as it is or called per resolution. */
export function relationsOf<Ctx>(
	ctx: unknown,
	relations: RelationChecker | ((ctx: Ctx) => RelationChecker) | undefined,
): RelationChecker | undefined {
	if (typeof relations !== 'function') return relations;
	return madeBy(ctx)?.[BRAND].relations() ?? relations(ctx as Ctx);
}
