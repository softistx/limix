/**
 * The registered symbol a refusal carries, so another copy of this package still
 * recognises it. Not exported: the contract between copies is the registry key
 * `Symbol.for('limix.refusal')`, which `isLimixRefusal` reads.
 */
export const LIMIX_REFUSAL: unique symbol = Symbol.for('limix.refusal');

/**
 * A refusal in the shape an integration maps: a code, an HTTP status and the
 * values the code's words interpolate. `LimixRefusal` has these fields; so do
 * the refusals of other packages an integration maps beside it.
 */
export interface Refusal {
	readonly code: string;
	readonly status: number;
	readonly params: Readonly<Record<string, unknown>>;
}

/**
 * Why a caller was refused, with no HTTP framework in it: an integration maps
 * `code` to its own words and `status` to its own response.
 */
export class LimixRefusal extends Error implements Refusal {
	override readonly name = 'LimixRefusal';
	readonly [LIMIX_REFUSAL] = true;
	readonly code: string;
	readonly status: number;
	readonly params: Readonly<Record<string, unknown>>;

	constructor(
		code: string,
		status: number,
		params: Readonly<Record<string, unknown>> = {},
	) {
		super(code);
		this.code = code;
		this.status = status;
		this.params = params;
	}
}

/** True for a refusal of this package or of another copy of it, without importing the class. */
export function isLimixRefusal(value: unknown): value is LimixRefusal {
	return (
		typeof value === 'object' &&
		value !== null &&
		(value as Record<symbol, unknown>)[LIMIX_REFUSAL] === true
	);
}

/** The answer of an evaluation: let it through, or refuse with a reason. */
export type Decision =
	| { readonly allow: true }
	| { readonly allow: false; readonly refusal: LimixRefusal };

export const ALLOW: Decision = { allow: true };

export const CODE_UNAUTHENTICATED = 'auth.errors.unauthenticated';
export const CODE_FORBIDDEN = 'auth.errors.forbidden';
/** Under `auth.errors.` because `@softistx/alxia-access`'s `refusalOf` reads no other prefix but `tenancy.errors.`. */
export const CODE_NOT_FOUND = 'auth.errors.not-found';
/** Not under `auth.errors.`: an integration (limix-alxia) maps it to its own 503. */
export const CODE_UNAVAILABLE = 'limix.errors.unavailable';

export function refuse(refusal: LimixRefusal): Decision {
	return { allow: false, refusal };
}

export const unauthenticated = () =>
	refuse(new LimixRefusal(CODE_UNAUTHENTICATED, 401));

export const forbidden = (reason?: string) =>
	refuse(
		new LimixRefusal(
			CODE_FORBIDDEN,
			403,
			reason === undefined ? {} : { reason },
		),
	);

/** No policy held, or a rule that cannot be answered (no relation checker). */
export const unavailable = (reason: string) =>
	refuse(new LimixRefusal(CODE_UNAVAILABLE, 503, { reason }));

/**
 * What a failed rung answers: its `code` when it named one. A custom code must
 * sit under `auth.errors.` for `@softistx/alxia-access`'s `refusalOf` to read it.
 */
export function denied(
	onDeny: 'NOT_FOUND' | 'FORBIDDEN',
	code: string | undefined,
): Decision {
	return onDeny === 'FORBIDDEN'
		? refuse(new LimixRefusal(code ?? CODE_FORBIDDEN, 403))
		: refuse(new LimixRefusal(code ?? CODE_NOT_FOUND, 404));
}
