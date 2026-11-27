import type { CompiledPolicy } from '@softistx/limix';
import { separatedGuards, unguardedRoutes } from './endpoints';
import { alxiaOperations } from './operations';
import type { RoutesOf } from './options';
import { reaches } from './overlap';

const CODE_PREFIX = 'auth.errors.';

/** What a check found wrong: the `kind` of a `RouteIssue`. */
export type RouteIssueKind =
	| 'rung-code'
	| 'unmatched-rule'
	| 'open-route'
	| 'separated-guards';

/**
 * What a check found wrong. `path` is the rule key (`GET /files/*path`,
 * `Query.me`) or the route label (`GET /admin`), not a place in the rules file
 * as `NeedsIssue.path` is.
 */
export interface RouteIssue {
	/** `rung-code`: a relation rung's code outside `auth.errors.`; `unmatched-rule`: a REST rule no route takes; `open-route`: a route or socket that never runs the guard; `separated-guards`: a hook between a group's guard and the app's. */
	readonly kind: RouteIssueKind;
	/** The rule (`GET /files/*path`, `Query.me`) or the route (`GET /admin`) the issue is about. */
	readonly path: string;
	/** What is wrong. */
	readonly message: string;
	/** What to do about it. */
	readonly fix: string;
}

/** One rule's rungs: `[where, code]` for each rung whose `code` sits outside `auth.errors.`. */
function badCodes(
	where: string,
	rule: { relations?: readonly { code?: string | undefined }[] | undefined },
): RouteIssue[] {
	return (rule.relations ?? []).flatMap((rung) =>
		rung.code === undefined || rung.code.startsWith(CODE_PREFIX)
			? []
			: [
					{
						kind: 'rung-code' as const,
						path: where,
						message: `the relation rung's code "${rung.code}" is outside \`${CODE_PREFIX}\`, which an alxia host reads its refusals by (\`refusalOf\` of @softistx/alxia-access)`,
						fix: `give the rung a code under \`${CODE_PREFIX}\`, or none`,
					},
				],
	);
}

const text = (issue: RouteIssue): string => `${issue.path}: ${issue.message}`;

/** The rungs of a policy, REST and GraphQL, whose refusal code an alxia host would not read. */
export function rungCodeIssues(policy: CompiledPolicy): RouteIssue[] {
	const rest = policy.restRoutes.flatMap((route) =>
		badCodes(`${route.method} ${route.pattern}`, route.rule),
	);
	const graphql = Object.entries(policy.graphql ?? {}).flatMap(
		([type, rules]) =>
			Object.entries(rules).flatMap(([field, entry]) =>
				badCodes(`${type}.${field}`, entry.rule),
			),
	);
	return [...rest, ...graphql];
}

/** `rungCodeIssues` as lines of text. */
export const rungCodeProblems = (policy: CompiledPolicy): string[] =>
	rungCodeIssues(policy).map(text);

/**
 * What a policy gets wrong against the routes it guards: a rung code outside
 * `auth.errors.`, and a REST rule no route of the app can take (a typo that
 * leaves the route to `unmatched`).
 */
export function policyIssues(
	policy: CompiledPolicy,
	app: RoutesOf,
): RouteIssue[] {
	const issues = rungCodeIssues(policy);
	const operations = alxiaOperations(app);
	const basePath = policy.global.basePath ?? '';
	for (const { method, pattern } of policy.restRoutes) {
		// A rule for method `*` is reached by a route of any method.
		const reached = operations.some(
			(operation) =>
				(method === '*' || operation.method === method) &&
				reaches(pattern, operation.path, basePath),
		);
		if (!reached) {
			issues.push({
				kind: 'unmatched-rule',
				path: `${method} ${pattern}`,
				message:
					'no route of the app takes this rule, so the routes it was written for are left to `unmatched`',
				fix: "correct the rule's pattern (`/files/*path`, `/notes/:id`) or the route, or remove the rule",
			});
		}
	}
	return issues;
}

/** `policyIssues` as lines of text. */
export const policyProblems = (
	policy: CompiledPolicy,
	app: RoutesOf,
): string[] => policyIssues(policy, app).map(text);

/**
 * What a policy gets wrong against the routes it guards (a rung code, a rule no
 * route takes), as issues; empty means it fits. It never throws: call it in a
 * spec, or at boot once the routes are declared.
 */
export function checkRoutes(
	policy: CompiledPolicy,
	app: RoutesOf,
): readonly RouteIssue[] {
	return policyIssues(policy, app);
}

/** The routes and sockets of `app` that the guard does not judge alone, as issues. */
export function guardIssues(guard: unknown, app: RoutesOf): RouteIssue[] {
	return [
		...unguardedRoutes(app, guard).map(
			(route): RouteIssue => ({
				kind: 'open-route',
				path: route,
				message:
					'does not run this guard (declared before its use(), or outside the scope it was used in), so it would run without the rules',
				fix: 'Put `app.use(limixGuard({ ..., app }))` before them, and give each guard the app it is used on',
			}),
		),
		...separatedGuards(app, guard).map(
			(route): RouteIssue => ({
				kind: 'separated-guards',
				path: route,
				message:
					"a hook stands between this guard and the group's guard, so both judge it",
				fix: "put the group's guard first in the group and limixGuard last among the app's own middlewares",
			}),
		),
	];
}

/**
 * Every route or socket of `app` whose chain does not hold `guard` (the
 * middleware `limixGuard()` returned), or has a hook between two guards, as
 * issues; empty means fine. A route declared before the `use()`, or outside the
 * scope it was used in, runs without the rules. The guard registers this check
 * on `app`'s `onStart` (which throws); call it in a spec for an app that is
 * never started through `listen`.
 */
export function checkGuard(
	guard: unknown,
	app: RoutesOf,
): readonly RouteIssue[] {
	return guardIssues(guard, app);
}

/** The TypeError the start hook throws for `checkGuard`'s issues, worded from the issues themselves. */
export function guardError(issues: readonly RouteIssue[]): TypeError {
	const open = issues.filter((issue) => issue.kind === 'open-route');
	const apart = issues.filter((issue) => issue.kind === 'separated-guards');
	return new TypeError(
		[
			...(open.length === 0
				? []
				: [
						`checkGuard(): routes that never run the guard and stay open: ${open.map((issue) => issue.path).join(', ')}. ${open[0]?.fix}`,
					]),
			...(apart.length === 0
				? []
				: [
						`checkGuard(): ${apart.map((issue) => `${issue.path}: ${issue.message}; ${issue.fix}`).join('\n- ')}`,
					]),
		].join('\n'),
	);
}
