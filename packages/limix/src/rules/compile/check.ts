import type { RulesIssue } from '../error';
import { DEFAULT_FROM } from '../terms';
import type { GraphqlRule, RestRule } from '../types';
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
	if (rule.public) {
		for (const key of ['roles', 'permissions', 'when'] as const) {
			if (rule[key]?.length) {
				issues.push({
					path: where,
					message: `\`public\` and \`${key}\` are contradictory: a public rule admits every caller, and \`${key}\` would narrow who may reach it`,
				});
			}
		}
	}
}

/** True when the rule declares at least one relation rung. */
export function usesRelations(rule: Rule): boolean {
	return Boolean(rule.relations?.length);
}

/** A REST relation term reading `param.<name>` must name a parameter of its pattern. */
export function checkParams(
	rule: Rule,
	where: string,
	names: ReadonlySet<string>,
	issues: RulesIssue[],
): void {
	for (const [rungIndex, rung] of (rule.relations ?? []).entries()) {
		for (const [altIndex, alternative] of rung.require.entries()) {
			for (const [termIndex, term] of alternative.entries()) {
				const from = term.from ?? DEFAULT_FROM.rest;
				if (!from.startsWith('param.')) continue;
				const name = from.split('.')[1] ?? '';
				if (names.has(name)) continue;
				issues.push({
					path: `${where}.relations[${rungIndex}].require[${altIndex}][${termIndex}].from`,
					message: `\`${from}\` names no parameter of the pattern: it captures ${names.size ? [...names].join(', ') : 'none'}`,
				});
			}
		}
	}
}
