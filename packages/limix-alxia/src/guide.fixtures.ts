/** The fenced blocks of a Markdown guide, each with the marker line above it. */
export interface Fence {
	language: string;
	marker: string | undefined;
	body: string;
	line: number;
}

const MARKER = /^<!-- (checked: [\w.-]+\.ts|checked: rules|before) -->$/;

/** Every fenced block of the guide, with the marker line above it, if any. */
export function fencesOf(text: string): Fence[] {
	const fences: Fence[] = [];
	const lines = text.split('\n');
	let last: string | undefined;
	for (let at = 0; at < lines.length; at++) {
		const open = /^```(\w+)\s*$/.exec(lines[at] ?? '');
		if (!open) {
			if ((lines[at] ?? '').trim() !== '') last = lines[at];
			continue;
		}
		const start = at + 1;
		const body: string[] = [];
		for (
			at = start;
			at < lines.length && !/^```\s*$/.test(lines[at] ?? '');
			at++
		) {
			body.push(lines[at] ?? '');
		}
		fences.push({
			language: open[1] ?? '',
			marker:
				last !== undefined && MARKER.test(last) ? last.slice(5, -4) : undefined,
			body: body.join('\n'),
			line: start,
		});
		last = undefined;
	}
	return fences;
}
