/** One thing wrong with a rules document, at the place it is wrong. */
export interface RulesIssue {
	/** Where, as written in the document: `rest['/a'].GET.keto`. Empty for the whole document. */
	path: string;
	message: string;
}

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** `['rest', '/a', 'GET', 0]` as `rest['/a'].GET[0]`. */
export function formatPath(segments: readonly PropertyKey[]): string {
	let out = '';
	for (const segment of segments) {
		if (typeof segment === 'number') out += `[${segment}]`;
		else if (IDENTIFIER.test(String(segment)))
			out += out ? `.${String(segment)}` : String(segment);
		else out += `['${String(segment)}']`;
	}
	return out;
}

/** Thrown when rules are invalid: lists every issue with its path. */
export class RulesError extends Error {
	override readonly name = 'RulesError';
	readonly issues: readonly RulesIssue[];

	constructor(issues: readonly RulesIssue[], source?: string) {
		const count = issues.length;
		const head = `Invalid rules${source ? ` in ${source}` : ''}: ${count} ${count === 1 ? 'issue' : 'issues'}`;
		const lines = issues.map(
			(issue) => `  ${issue.path || '(document)'}: ${issue.message}`,
		);
		super([head, ...lines].join('\n'));
		this.issues = issues;
	}
}
