/** One fenced block of a Markdown guide. */
export interface Fence {
	/** Lower case, with the aliases of TypeScript and YAML folded into `ts` and `yaml`. */
	language: string;
	/** The marker comment above the fence, without its `<!-- -->`, if there is one. */
	marker: string | undefined;
	body: string;
	line: number;
}

const MARKER = /^<!-- (checked: [\w.-]+\.ts|checked: rules|before) -->$/;
const OPENER = /^\s*(`{3,}|~{3,})\s*([\w-]*)/;
const ALIASES: Readonly<Record<string, string>> = {
	typescript: 'ts',
	tsx: 'ts',
	js: 'ts',
	mjs: 'ts',
	javascript: 'ts',
	yml: 'yaml',
};

/** The languages a fence may have without a marker, besides `ts` and `yaml`, which need one. */
export const FREE_LANGUAGES = ['sh', 'toml', 'json', 'jsonc', 'text'];

/** Every fenced block (backticks or tildes, indented or not), with the marker line above it, if any. */
export function fencesOf(text: string): Fence[] {
	const fences: Fence[] = [];
	const lines = text.split('\n');
	let last: string | undefined;
	for (let at = 0; at < lines.length; at++) {
		const open = OPENER.exec(lines[at] ?? '');
		if (!open) {
			if ((lines[at] ?? '').trim() !== '') last = (lines[at] ?? '').trim();
			continue;
		}
		const fence = open[1] ?? '';
		const closes = (line: string) => {
			const trimmed = line.trim();
			return (
				trimmed.length >= fence.length &&
				trimmed.split('').every((char) => char === fence[0])
			);
		};
		const start = at + 1;
		const body: string[] = [];
		for (at = start; at < lines.length && !closes(lines[at] ?? ''); at++) {
			body.push(lines[at] ?? '');
		}
		const language = (open[2] ?? '').toLowerCase();
		fences.push({
			language: ALIASES[language] ?? language,
			marker:
				last !== undefined && MARKER.test(last) ? last.slice(5, -4) : undefined,
			body: body.join('\n'),
			line: start,
		});
		last = undefined;
	}
	return fences;
}

/** Why a guide's fences cannot be trusted: an unknown language, a missing marker, limix code passed off as "before". */
export function problemsOf(fences: readonly Fence[]): string[] {
	const problems: string[] = [];
	for (const fence of fences) {
		const where = `line ${fence.line}`;
		if (fence.language === 'ts' || fence.language === 'yaml') {
			if (!fence.marker)
				problems.push(`${where}: a ${fence.language} fence needs a marker`);
		} else if (!FREE_LANGUAGES.includes(fence.language)) {
			problems.push(`${where}: unknown fence language "${fence.language}"`);
		}
		if (fence.marker === 'before' && /@softistx\/limix/.test(fence.body)) {
			problems.push(`${where}: a "before" fence imports @softistx/limix`);
		}
	}
	return problems;
}
