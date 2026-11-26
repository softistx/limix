import type { RulesIssue } from '../error';
import type { GraphqlRule } from '../graphql';
import type { RestRule } from '../rest';
import type { Condition } from './types';

type Rule = RestRule | GraphqlRule;

/** Resolves `when` names to conditions, recording the unknown ones. */
export function resolveConditions(
	rule: Rule,
	where: string,
	registry: Readonly<Record<string, Condition>>,
	issues: RulesIssue[],
): Condition[] {
	const resolved: Condition[] = [];
	for (const [index, name] of (rule.when ?? []).entries()) {
		const condition = Object.hasOwn(registry, name)
			? registry[name]
			: undefined;
		if (condition) resolved.push(condition);
		else {
			const known = Object.keys(registry);
			issues.push({
				path: `${where}.when[${index}]`,
				message: `unknown condition \`${name}\`: registered ${known.length ? known.join(', ') : 'none'}`,
			});
		}
	}
	return resolved;
}

/** The contradictions a single rule can carry. */
export function checkContradictions(
	rule: Rule,
	where: string,
	issues: RulesIssue[],
): void {
	if (rule.authenticated && rule.public) {
		issues.push({
			path: where,
			message:
				'`authenticated` and `public` are contradictory: a rule either requires a signed-in caller or admits anonymous ones',
		});
	}
	if (rule.public && rule.relations?.length) {
		issues.push({
			path: where,
			message:
				'`public` and `relations` are contradictory: a relation check asks what the caller may do to an object, and a public rule admits callers there is nothing to ask about',
		});
	}
}
