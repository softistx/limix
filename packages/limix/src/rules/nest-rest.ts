import { normalisePattern } from './compile/entries';
import { formatPath, type RulesIssue } from './error';
import { FLAT_REST_KEY, REST_METHODS, splitFlatRest } from './keys';
import { duplicate, isObject, notAGroup, type Origin } from './nest-shared';

/**
 * Whether a rule of method `a` and one of method `b` could answer the same
 * request: the same method, either one `*`, or a GET and a HEAD (a HEAD
 * request faces the GET rules). No pattern overlap is computed, so the answer
 * is a conservative one.
 */
function compete(a: string, b: string): boolean {
	return (
		a === b ||
		a === '*' ||
		b === '*' ||
		(a === 'GET' && b === 'HEAD') ||
		(a === 'HEAD' && b === 'GET')
	);
}

/** A key that looks flat and is not (`get /a`, `GET  /a`): what was probably meant. */
function looksFlat(key: string): string | undefined {
	if (!/^[^/\s]+\s+[/*]/.test(key)) return undefined;
	return key.replace(
		/^(\S+)\s+/,
		(_, method: string) => `${method.toUpperCase()} `,
	);
}

/** One group of the output: a path with the rules it holds by method. */
type Group = { rules: Map<string, unknown> };

/** What nesting REST rules shares between its steps. */
type State = {
	groups: Map<string, Group>;
	seen: Map<string, PropertyKey[]>;
	issues: RulesIssue[];
	origins: Origin[];
	/** The rules come as a list of blocks: paths carry the block index. */
	listed: boolean;
	/** The block each group was first written in, to name it in a refusal. */
	openedIn: Map<string, number>;
	/** The block being read. */
	block: number;
};

/** The first rule written after `pattern`'s group that could answer the same request as `method`. */
function jumpedOver(state: State, pattern: string, method: string) {
	const keys = [...state.groups.keys()];
	return keys
		.slice(keys.indexOf(pattern) + 1)
		.flatMap((other) =>
			[...(state.groups.get(other)?.rules.keys() ?? [])].map(
				(m) => [other, m] as const,
			),
		)
		.find(([, m]) => compete(method, m));
}

/** Puts one rule under its path, refusing a duplicate and a move over a competing rule. */
function place(
	state: State,
	pattern: string,
	method: string,
	rule: unknown,
	where: PropertyKey[],
	flat: boolean,
) {
	const { groups, seen, issues, origins } = state;
	const name = `${method} ${normalisePattern(pattern)}`;
	const first = seen.get(name);
	if (first) {
		issues.push(duplicate(first, where, name));
		return;
	}
	const existing = groups.get(pattern);
	const jumped = existing ? jumpedOver(state, pattern, method) : undefined;
	if (jumped) {
		issues.push({
			path: formatPath(where),
			message: `\`${method} ${pattern}\` would move above \`${jumped[1]} ${jumped[0]}\`: ${
				flat
					? `nest it under \`${pattern}\``
					: `write it with the first \`${pattern}\` rules${
							state.listed ? `, in rest[${state.openedIn.get(pattern)}]` : ''
						}`
			}, or write \`${jumped[0]}\` after it`,
		});
		return;
	}
	seen.set(name, where);
	// Across blocks every rule is named by its block, flat or nested.
	if (flat || state.listed) {
		origins.push([formatPath(['rest', pattern, method]), formatPath(where)]);
	}
	if (existing) existing.rules.set(method, rule);
	else {
		groups.set(pattern, { rules: new Map([[method, rule]]) });
		state.openedIn.set(pattern, state.block);
	}
}

/** The refusal of a key that looks flat and is not, or `undefined`. */
function malformedKey(
	key: string,
	base: PropertyKey[],
): RulesIssue | undefined {
	const meant = FLAT_REST_KEY.test(key) ? undefined : looksFlat(key);
	if (meant === undefined) return undefined;
	return {
		path: formatPath([...base, key]),
		message: `\`${key}\` is not a rule key: did you mean \`${meant}\`? A flat key is a method (${REST_METHODS.join(', ')} or *), one space, then the path pattern`,
	};
}

/**
 * Nests the flat keys of the `rest` blocks under their paths, in document order
 * (a list is read block after block). `listed` says the rules came as a list,
 * so that paths carry the block index: `rest[1]['GET /a']`.
 */
export function nestRest(
	blocks: readonly unknown[],
	listed: boolean,
	issues: RulesIssue[],
	origins: Origin[],
) {
	const state: State = {
		groups: new Map(),
		seen: new Map(),
		issues,
		origins,
		listed,
		openedIn: new Map(),
		block: 0,
	};
	const passed = new Map<string, unknown>();
	blocks.forEach((rest, index) => {
		state.block = index;
		if (!isObject(rest)) {
			if (listed) {
				issues.push({
					path: formatPath(['rest', index]),
					message: 'a rules block must be an object',
				});
			}
			return;
		}
		const base: PropertyKey[] = listed ? ['rest', index] : ['rest'];
		for (const [key, value] of Object.entries(rest)) {
			if (value === undefined) continue;
			const malformed = malformedKey(key, base);
			if (malformed) {
				issues.push(malformed);
			} else if (FLAT_REST_KEY.test(key)) {
				const { method, pattern } = splitFlatRest(key);
				place(state, pattern, method, value, [...base, key], true);
			} else if (isObject(value)) {
				// A group is registered even when empty, so that a later flat key joins it.
				if (!state.groups.has(key)) {
					state.groups.set(key, { rules: new Map() });
					state.openedIn.set(key, index);
				}
				for (const [method, rule] of Object.entries(value)) {
					if (rule === undefined) continue;
					place(state, key, method, rule, [...base, key, method], false);
				}
			} else if (listed) {
				// Kept out of the output: it would replace an earlier block's group.
				issues.push(notAGroup([...base, key], value, 'a path group'));
			} else {
				passed.set(key, value);
			}
		}
	});
	return Object.fromEntries([
		...[...state.groups].map(
			([pattern, group]) => [pattern, Object.fromEntries(group.rules)] as const,
		),
		...passed,
	]);
}
