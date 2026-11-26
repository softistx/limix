import { RemotePolicyConfigError } from './errors';
import type { RemotePolicyOptions } from './types';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function assertSecure(name: string, value: string) {
	const url = new URL(value);
	if (url.protocol === 'https:') return;
	if (url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname)) return;
	throw new RemotePolicyConfigError(
		`remotePolicy: \`${name}\` must be https (http only for localhost, 127.0.0.1 or ::1), got ${url.protocol}//${url.hostname}`,
	);
}

/** The largest delay a timer takes; above it the delay overflows to 1 ms. */
const MAX_TIMER_MS = 2_147_483_647;

function assertDuration(name: string, value: unknown, allowInfinity: boolean) {
	if (value === undefined) return;
	if (allowInfinity) {
		if (typeof value === 'number' && value > 0) return;
		throw new RemotePolicyConfigError(
			`remotePolicy: \`${name}\` must be a number above 0 (or Infinity), got ${String(value)}`,
		);
	}
	if (
		Number.isInteger(value) &&
		(value as number) > 0 &&
		(value as number) <= MAX_TIMER_MS
	)
		return;
	throw new RemotePolicyConfigError(
		`remotePolicy: \`${name}\` must be an integer from 1 to ${MAX_TIMER_MS}, got ${String(value)}`,
	);
}

/** Constructor checks: where keys come from, no cleartext URL, sane durations. */
export function assertOptions(options: RemotePolicyOptions): void {
	if (!options.jwksUri && !options.issuer) {
		throw new RemotePolicyConfigError(
			'remotePolicy: give `jwksUri`, `issuer`, or both',
		);
	}
	assertSecure('rulesUrl', options.rulesUrl);
	if (options.jwksUri) assertSecure('jwksUri', options.jwksUri);
	if (options.issuer) assertSecure('issuer', options.issuer);
	assertDuration('timeoutMs', options.timeoutMs, false);
	assertDuration('intervalMs', options.intervalMs, false);
	assertDuration('maxStaleMs', options.maxStaleMs, true);
}
