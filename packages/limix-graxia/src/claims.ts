import type { Claims } from '@softistx/limix';

/** What the plugin adds to the context: the caller's claims, read once. */
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

const reads = new WeakMap<object, () => Promise<Claims>>();

/**
 * The claims of a context: the plugin's `ctx.limix.claims()` when it ran, else
 * `read(ctx)`, memoised per context object so a request reads them once.
 */
export function claimsOf<Ctx>(
	ctx: unknown,
	read: (ctx: Ctx) => Claims | Promise<Claims>,
): Promise<Claims> {
	if (typeof ctx !== 'object' || ctx === null) {
		return Promise.resolve().then(() => checked(read(ctx as Ctx)));
	}
	const added = (ctx as Partial<LimixContext>).limix;
	if (typeof added?.claims === 'function') return added.claims();
	let once = reads.get(ctx);
	if (!once) {
		once = onceClaims(() => read(ctx as Ctx));
		reads.set(ctx, once);
	}
	return once();
}
