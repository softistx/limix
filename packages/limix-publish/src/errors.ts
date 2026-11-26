/** Why a key or an option was refused, by `code`. */
export type PublishErrorCode = 'KEY' | 'OPTIONS';

/**
 * Thrown for a key or an option this package will not sign or serve with.
 * Invalid rules are a `RulesError` from `@softistx/limix`, not this.
 */
export class PublishError extends Error {
	override readonly name = 'PublishError';
	constructor(
		readonly code: PublishErrorCode,
		message: string,
		options?: { cause?: unknown },
	) {
		super(message, options);
	}
}
