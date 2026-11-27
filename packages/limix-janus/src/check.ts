import type { CompiledPolicy } from '@softistx/limix';

/**
 * What is wrong with a relation term: its `type` is not a type of the model
 * (`unknown-type`), its `relation` is neither a relation nor a permission of
 * that type (`unknown-relation`), or it is read from a field (`from-field`,
 * which the adapter does not support). A new kind is a minor release.
 */
export type ModelIssueKind = 'unknown-type' | 'unknown-relation' | 'from-field';

/** One relation term the janus model cannot answer, and where the rules write it. */
export interface ModelIssue {
	readonly kind: ModelIssueKind;
	/** Where, as written in the rules: `rest['/documents/:id'].PUT.relations[0].require[0][0]`. */
	readonly path: string;
	readonly message: string;
}

/** What `checkModel` reads of `defineModel(...)`'s answer. */
export interface ModelLike {
	readonly types: readonly string[];
	readonly definition: {
		readonly types: {
			readonly [type: string]: {
				readonly related?: { readonly [name: string]: unknown };
				readonly permits?: { readonly [name: string]: unknown };
			};
		};
	};
}

interface Term {
	readonly relation: string;
	readonly type: string;
}

interface RuleLike {
	readonly relations?:
		| readonly {
				readonly require: readonly (readonly Term[])[];
		  }[]
		| undefined;
}

const isFromField = (
	related: { readonly [name: string]: unknown } | undefined,
	name: string,
): boolean =>
	related !== undefined &&
	Object.hasOwn(related, name) &&
	(related[name] as { kind?: unknown } | null)?.kind === 'fromField';

const key = (name: string): string =>
	/^[A-Za-z_$][\w$]*$/.test(name) ? `.${name}` : `['${name}']`;

/**
 * Every `[where, rule]` of the policy, REST then GraphQL: REST by method, then
 * in document order. A REST path is the rules file's pattern, without
 * `global.basePath`, as core's `RulesIssue` paths are.
 */
function* rulesOf(policy: CompiledPolicy): Generator<[string, RuleLike]> {
	const basePath = policy.global.basePath ?? '';
	for (const [method, routes] of policy.restRoutesByMethod) {
		for (const route of routes) {
			const pattern = route.pattern.startsWith(basePath)
				? route.pattern.slice(basePath.length)
				: route.pattern;
			yield [`rest['${pattern}']${key(method)}`, route.rule];
		}
	}
	for (const [type, fields] of Object.entries(policy.graphql ?? {})) {
		for (const [field, entry] of Object.entries(fields)) {
			yield [`graphql${key(type)}${key(field)}`, entry.rule];
		}
	}
}

/**
 * Lists every relation term of `policy` the janus `model` cannot answer: its
 * `type` is not a type of the model, or its `relation` is neither a relation
 * nor a permission of that type. Empty means consistent. Run it at startup or
 * in a spec, so a typo fails there rather than as a janus error at request time.
 */
export function checkModel(
	policy: CompiledPolicy,
	model: ModelLike,
): ModelIssue[] {
	const issues: ModelIssue[] = [];
	const types = model.definition.types;
	for (const [where, rule] of rulesOf(policy)) {
		for (const [rung, { require }] of (rule.relations ?? []).entries()) {
			for (const [alt, terms] of require.entries()) {
				for (const [index, term] of terms.entries()) {
					const path = `${where}.relations[${rung}].require[${alt}][${index}]`;
					const def = Object.hasOwn(types, term.type)
						? types[term.type]
						: undefined;
					if (!def) {
						issues.push({
							kind: 'unknown-type',
							path,
							message: `type \`${term.type}\` is not a type of the janus model (it declares ${model.types.join(', ') || 'none'})`,
						});
					} else if (isFromField(def.related, term.relation)) {
						issues.push({
							kind: 'from-field',
							path,
							message: `\`${term.relation}\` of \`${term.type}\` is read from a field (fromField), which is not supported: the adapter sends { type, id } only; see the \`load\` option on the roadmap`,
						});
					} else if (
						!Object.hasOwn(def.related ?? {}, term.relation) &&
						!Object.hasOwn(def.permits ?? {}, term.relation)
					) {
						const names = [
							...Object.keys(def.related ?? {}),
							...Object.keys(def.permits ?? {}),
						];
						issues.push({
							kind: 'unknown-relation',
							path,
							message: `\`${term.relation}\` is neither a relation nor a permission of \`${term.type}\` (it declares ${names.join(', ') || 'none'})`,
						});
					}
				}
			}
		}
	}
	return issues;
}
