/** The registered symbol a refusal carries, so another copy of this package still recognises it. */
export const LIMIX_REFUSAL: unique symbol = Symbol.for('limix.refusal');

/**
 * Why a caller was refused, with no HTTP framework in it: an integration maps
 * `code` to its own words and `status` to its own response.
 */
export class LimixRefusal extends Error {
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
export const CODE_NOT_FOUND = 'errors.not-found';
export const CODE_UNAVAILABLE = 'limix.errors.unavailable';

export function refuse(refusal: LimixRefusal): Decision {
	return { allow: false, refusal };
}

export const unauthenticated = () =>
	refuse(new LimixRefusal(CODE_UNAUTHENTICATED, 401));

export const forbidden = () => refuse(new LimixRefusal(CODE_FORBIDDEN, 403));

/** No policy held, or a rule that cannot be answered (no relation checker). */
export const unavailable = (reason: string) =>
	refuse(new LimixRefusal(CODE_UNAVAILABLE, 503, { reason }));

/** What a failed rung answers: its `message` as the code when it named one. */
export function denied(
	onDeny: 'NOT_FOUND' | 'FORBIDDEN',
	message: string | undefined,
): Decision {
	return onDeny === 'FORBIDDEN'
		? refuse(new LimixRefusal(message ?? CODE_FORBIDDEN, 403))
		: refuse(new LimixRefusal(message ?? CODE_NOT_FOUND, 404));
}
