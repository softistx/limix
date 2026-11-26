import type { RemotePolicyError } from './errors';
import type { RemotePolicyLogger, RemotePolicyOptions } from './types';

/** Logs a failure, then hands it to `onError`; a throwing callback is contained. */
export function createReporter(
	options: Pick<RemotePolicyOptions, 'onError'>,
	logger: RemotePolicyLogger,
): (error: RemotePolicyError) => void {
	return (error) => {
		logger.error(`remotePolicy: ${error.code}: ${error.message}`, {
			code: error.code,
		});
		try {
			options.onError?.(error);
		} catch (callbackError) {
			logger.error('remotePolicy: onError threw', {
				error: String(callbackError),
			});
		}
	};
}
