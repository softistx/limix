import type { RemotePolicyErrorCode } from './types';

/** Why a pull, a stored copy or a store write was not accepted. */
export class RemotePolicyError extends Error {
	override readonly name = 'RemotePolicyError';
	constructor(
		readonly code: RemotePolicyErrorCode,
		message: string,
		options?: { cause?: unknown },
	) {
		super(message, options);
	}
}

/** Thrown by `remotePolicy()` at construction for an option it cannot run with. */
export class RemotePolicyConfigError extends TypeError {
	override readonly name = 'RemotePolicyConfigError';
}
