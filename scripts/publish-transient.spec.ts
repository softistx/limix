import { describe, expect, test } from 'bun:test';
import { isTransientPublishError } from './publish-transient';

const PACKUMENT =
	'Failed to save packument. A common cause is if you try to publish a new package before the previous package has been fully processed.';

describe('isTransientPublishError', () => {
	test.each([
		PACKUMENT,
		'error: E500 Internal Server Error',
		'npm error 502 Bad Gateway',
		'npm error code E429\nToo Many Requests',
		'ECONNRESET',
		'error: ConnectionRefused',
		'FailedToOpenSocket',
		'getaddrinfo ENOTFOUND registry.npmjs.org',
		'HTTP/1.1 503 Service Unavailable',
		'error: publish failed with status 503',
		'status: 503',
	])('%s is transient', (output) => {
		expect(isTransientPublishError(output)).toBe(true);
	});

	test.each([
		'npm error code E403 Forbidden',
		'npm error 401 Unauthorized',
		'E409 Cannot publish over previously staged version',
		'npm error 404 Not Found',
		'E403 You cannot publish over the previously published versions: 1.2.3',
		'E403 Forbidden publishing @softistx/x@1.0.500',
		'E403 You cannot publish over the previously published versions: 1.2.510',
		'E409 Cannot publish over previously staged version 2.0.503',
		'E404 not found, packed 512 files',
		'packed 503 files, then it broke',
		'error: 503 files packed',
		'status 503 files',
		'error 500 tarball files',
		'npm notice https://registry.npmjs.org/x 500 files',
		'',
	])('%s is not transient', (output) => {
		expect(isTransientPublishError(output)).toBe(false);
	});
});
