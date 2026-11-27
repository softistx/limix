/** Whether a rule's pattern can take a path a route's pattern takes: the segment matcher of the stale-rule check. */

type Segment =
	| { kind: 'literal'; text: string }
	| { kind: 'param' }
	| { kind: 'wild' }
	/** The `*` ending an alxia route: it takes an empty tail too. */
	| { kind: 'tail' };

/** The segments of a pattern, the optional groups of a rule's pattern taken both ways. */
function variants(pattern: string): Segment[][] {
	const open = pattern.search(/(?<!\\)\{/);
	const close = open < 0 ? -1 : pattern.indexOf('}', open);
	if (open < 0 || close < 0) return [segmentsOf(pattern)];
	const head = pattern.slice(0, open);
	const tail = pattern.slice(close + 1);
	return [
		...variants(`${head}${tail}`),
		...variants(`${head}${pattern.slice(open + 1, close)}${tail}`),
	];
}

function segmentsOf(pattern: string): Segment[] {
	return pattern
		.split('/')
		.filter((text) => text !== '')
		.map((text): Segment => {
			if (text.startsWith('*')) return { kind: 'wild' };
			if (/(?<!\\):/.test(text)) return { kind: 'param' };
			return { kind: 'literal', text: text.replace(/\\(.)/g, '$1') };
		});
}

/** A route's segments, its trailing wildcard marked as alxia's optional tail. */
const asRoute = (segments: Segment[]): Segment[] =>
	segments.map((segment, index) =>
		segment.kind === 'wild' && index === segments.length - 1
			? { kind: 'tail' }
			: segment,
	);

/** Whether some path fits both segment lists. */
function overlap(a: readonly Segment[], b: readonly Segment[]): boolean {
	for (let i = 0; ; i++) {
		const x = a[i];
		const y = b[i];
		if (x === undefined || y === undefined) {
			return x === y || x?.kind === 'tail' || y?.kind === 'tail';
		}
		if (x.kind !== 'literal' && x.kind !== 'param') return true;
		if (y.kind !== 'literal' && y.kind !== 'param') return true;
		if (x.kind === 'literal' && y.kind === 'literal' && x.text !== y.text) {
			return false;
		}
	}
}

/** Whether the rule's pattern can take a path the route's pattern takes (the rule's with or without the policy's `basePath`). */
export function reaches(rule: string, path: string, basePath: string): boolean {
	const routes = variants(path).map(asRoute);
	return [
		rule,
		...(basePath && rule.startsWith(basePath)
			? [rule.slice(basePath.length)]
			: []),
	]
		.flatMap(variants)
		.some((a) => routes.some((b) => overlap(a, b)));
}
