/** Permissions in conjunctive normal form: every group (any-of) must be met. */
export type Cnf = readonly (readonly string[])[];
/** Permissions in disjunctive normal form: one alternative (all-of) must be held. */
export type Dnf = readonly (readonly string[])[];

/** The most terms an expansion may produce before a field is called too complex. */
export const EXPANSION_LIMIT = 1024;

const key = (terms: readonly string[]) => [...terms].sort().join('\u0000');

/** Drops a term that another term is a subset of (the other already covers it), and duplicates. */
function minimal(terms: readonly (readonly string[])[]): string[][] {
	const sets = terms.map((term) => new Set(term));
	const seen = new Set<string>();
	return sets
		.filter((mine, index) => {
			const id = key([...mine]);
			if (seen.has(id)) return false;
			seen.add(id);
			return !sets.some(
				(other, at) =>
					at !== index &&
					other.size < mine.size &&
					[...other].every((name) => mine.has(name)),
			);
		})
		.map((mine) => [...mine]);
}

/** The product of the groups: one pick per group. `undefined` past the limit, checked before the quadratic reduction of a step. */
function product(
	groups: readonly (readonly string[])[],
	limit: number,
): string[][] | undefined {
	let terms: string[][] = [[]];
	for (const group of groups) {
		const next: string[][] = [];
		for (const term of terms) {
			for (const name of group) next.push([...term, name]);
		}
		if (next.length > limit) return undefined;
		terms = minimal(next);
	}
	return terms;
}

/** CNF to DNF, minimal; `undefined` when it would pass `limit` terms. An empty group gives no term. */
export function cnfToDnf(cnf: Cnf, limit = EXPANSION_LIMIT): Dnf | undefined {
	return product(cnf, limit);
}

/** DNF to CNF (the same expansion, read the other way); `undefined` past `limit`. */
export function dnfToCnf(dnf: Dnf, limit = EXPANSION_LIMIT): Cnf | undefined {
	return product(dnf, limit);
}

/**
 * Whether everyone who holds `dnf` also meets `cnf`: each alternative must
 * share a permission with every group. Both are monotone, so this is exact.
 */
export function dnfImpliesCnf(dnf: Dnf, cnf: Cnf): boolean {
	return dnf.every((term) =>
		cnf.every((group) => group.some((name) => term.includes(name))),
	);
}

/** Whether everyone who holds `from` also holds `to`: each alternative of `from` contains one of `to`. */
export function dnfImpliesDnf(from: Dnf, to: Dnf): boolean {
	return from.every((term) =>
		to.some((goal) => goal.every((name) => term.includes(name))),
	);
}

/** The `@needs(...)` uses that say a CNF, one per group, as written in an SDL. */
export function needsText(cnf: Cnf): string {
	return cnf
		.map((group) =>
			group.length === 1
				? `@needs(permission: ${JSON.stringify(group[0])})`
				: `@needs(anyOf: ${JSON.stringify(group)})`,
		)
		.join(' ');
}
