/**
 * Classifies a failed `bun publish` as transient or permanent. Mirrored in
 * data, janus, core, http, di, telemetry and nxgt-ory (nxgt-data #461 is the
 * origin); a change to one is a change to port to the others.
 */

/**
 * A status code as npm prints it: `E503`, `HTTP/1.1 503`, `status 503` (not
 * followed by `files`), or the number followed by its status phrase
 * (`503 Service Unavailable`). A bare number after `error` is not enough:
 * `error: 503 files packed` is a file count.
 */
function statusCode(codes: string, phrases: string): RegExp {
	return new RegExp(
		`\\bE(?:${codes})\\b|\\bHTTP/\\d(?:\\.\\d)?\\s+(?:${codes})\\b|\\bstatus[:=]?\\s*(?:${codes})\\b(?!\\s+files)|\\b(?:${codes})\\s+(?:${phrases})`,
		'i',
	);
}

const PERMANENT = statusCode(
	'401|403|404|409',
	'unauthorized|forbidden|not found|conflict|cannot publish',
);
const TRANSIENT_STATUS = statusCode(
	'5\\d\\d|429',
	'internal|bad gateway|service unavailable|gateway time-?out|too many|server error',
);
const TRANSIENT_WORDS =
	/too many requests|bad gateway|service unavailable|gateway time-?out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|ConnectionClosed|ConnectionRefused|FailedToOpenSocket/i;
/** The answers that say the version is already there or staged. */
const ALREADY_THERE =
	/previously staged version|cannot publish over|previously published/i;

/**
 * An npmjs answer that a later attempt can change: "Failed to save packument"
 * (a publish sent while the previous package is still being processed), a 5xx
 * or 429 status, or a dropped or refused connection (Node and Bun error
 * names). A 401, 403, 404 or 409, and the "already published" or "previously
 * staged" wording, are never transient, whatever digits a version or a file
 * count adds.
 */
export function isTransientPublishError(output: string): boolean {
	if (/failed to save packument/i.test(output)) return true;
	if (PERMANENT.test(output) || ALREADY_THERE.test(output)) return false;
	return TRANSIENT_STATUS.test(output) || TRANSIENT_WORDS.test(output);
}
