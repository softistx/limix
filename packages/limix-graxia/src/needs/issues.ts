import type { Cnf } from './logic';

export type NeedsIssueKind =
	| 'needs-invalid'
	| 'needs-without-rule'
	| 'needs-unenforced'
	| 'needs-looser'
	| 'needs-stricter'
	| 'rule-without-needs'
	| 'needs-too-complex';

/** One disagreement between a field's `@needs` and the rule that guards it. */
export interface NeedsIssue {
	kind: NeedsIssueKind;
	/** `Type.field`. */
	coordinate: string;
	/** The place in the rules file: `graphql.Type.field`. */
	path: string;
	message: string;
	fix: string;
	/** What `@needs` asks (type, field and returned type), in conjunctive normal form. */
	needs: string[][];
	/** The rule's permissions (alternatives of all-of lists), when it has some. */
	permissions?: readonly (readonly string[])[];
	/** For `rule-without-needs`: the `@needs` text that would say the rule. Never written anywhere. */
	suggestion?: string;
}

export interface FieldFacts {
	coordinate: string;
	needs: Cnf;
	permissions?: readonly (readonly string[])[];
}

const copy = (value: readonly (readonly string[])[]) =>
	value.map((group) => [...group]);

/** Builds an issue: the coordinate, path and the two sides come from the facts. */
export function issue(
	kind: NeedsIssueKind,
	facts: FieldFacts,
	message: string,
	fix: string,
	suggestion?: string,
): NeedsIssue {
	return {
		kind,
		coordinate: facts.coordinate,
		path: `graphql.${facts.coordinate}`,
		message: `${facts.coordinate}: ${message}`,
		fix,
		needs: copy(facts.needs),
		...(facts.permissions === undefined
			? {}
			: { permissions: copy(facts.permissions) }),
		...(suggestion === undefined ? {} : { suggestion }),
	};
}
