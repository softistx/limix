import { UsageError } from './io';

const UNITS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86_400 };

/** `3600`, `90s`, `30m`, `12h` or `7d` as seconds. */
export function parseDuration(text: string): number {
	const match = /^(\d+)([smhd]?)$/.exec(text.trim());
	const seconds = match
		? Number(match[1]) * (UNITS[match[2] || 's'] as number)
		: 0;
	if (!match || seconds < 1) {
		throw new UsageError(
			`--expires "${text}" is not a duration: use seconds or 30m, 12h, 7d`,
		);
	}
	return seconds;
}
