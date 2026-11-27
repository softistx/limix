import type { CompiledPolicy } from '@softistx/limix';
import { separatedGuards, unguardedRoutes } from './endpoints';
import { alxiaOperations } from './operations';
import type { RoutesOf } from './options';

const CODE_PREFIX = 'auth.errors.';

/** One rule's rungs: `[where, code]` for each rung whose `code` sits outside `auth.errors.`. */
function badCodes(
	where: string,
	rule: { relations?: readonly { code?: string | undefined }[] | undefined },
): string[] {
	return (rule.relations ?? []).flatMap((rung) =>
		rung.code === undefined || rung.code.startsWith(CODE_PREFIX)
			? []
			: [
					`${where}: the relation rung's code "${rung.code}" is outside \`${CODE_PREFIX}\`, which an alxia host reads its refusals by (\`refusalOf\` of @softistx/alxia-access)`,
				],
	);
}

/** The rungs of a policy, REST and GraphQL, whose refusal code an alxia host would not read. */
export function rungCodeProblems(policy: CompiledPolicy): string[] {
	const rest = [...policy.restRoutesByMethod].flatMap(([method, routes]) =>
		routes.flatMap((route) =>
			badCodes(`${method} ${route.pattern}`, route.rule),
		),
	);
	const graphql = Object.entries(policy.graphql ?? {}).flatMap(
		([type, rules]) =>
			Object.entries(rules).flatMap(([field, entry]) =>
				badCodes(`${type}.${field}`, entry.rule),
			),
	);
	return [...rest, ...graphql];
}

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
function reaches(rule: string, path: string, basePath: string): boolean {
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

/**
 * What a policy gets wrong against the routes it guards: a rung code outside
 * `auth.errors.`, and a REST rule no route of the app can take (a typo that
 * leaves the route to `unmatched`).
 */
export function policyProblems(
	policy: CompiledPolicy,
	app: RoutesOf,
): string[] {
	const problems = rungCodeProblems(policy);
	const operations = alxiaOperations(app);
	const basePath = policy.global.basePath ?? '';
	for (const [method, routes] of policy.restRoutesByMethod) {
		for (const { pattern } of routes) {
			const reached = operations.some(
				(operation) =>
					operation.method === method &&
					reaches(pattern, operation.path, basePath),
			);
			if (!reached) {
				problems.push(
					`${method} ${pattern}: no route of the app takes this rule, so the routes it was written for are left to \`unmatched\``,
				);
			}
		}
	}
	return problems;
}

/**
 * Throws one TypeError listing everything `policyProblems` finds (a rung code,
 * a rule no route takes): the line for a boot script or a spec, once the routes
 * are declared.
 */
export function checkRoutes(policy: CompiledPolicy, app: RoutesOf): void {
	const problems = policyProblems(policy, app);
	if (problems.length > 0) {
		throw new TypeError(
			`checkRoutes(): the policy does not fit the app:\n- ${problems.join('\n- ')}`,
		);
	}
}

/**
 * Throws one TypeError naming every route or socket of `app` whose chain does
 * not hold `guard` (the middleware `limixGuard()` returned): one declared
 * before its `use()`, or outside the scope it was used in, runs without the
 * rules. The guard registers this check on `app`'s `onStart`; call it in a spec
 * for an app that is never started through `listen`.
 */
export function checkGuard(guard: unknown, app: RoutesOf): void {
	const loose = unguardedRoutes(app, guard);
	if (loose.length > 0) {
		throw new TypeError(
			`checkGuard(): routes that never run the guard and stay open: ${loose.join(', ')}. Put \`app.use(limixGuard({ ..., app }))\` before them, and give each guard the app it is used on`,
		);
	}
	const apart = separatedGuards(app, guard);
	if (apart.length > 0) {
		throw new TypeError(
			`checkGuard(): ${apart.map((route) => `${route}: a hook stands between this guard and the group's guard, so both judge it; put the group's guard first in the group and limixGuard last among the app's own middlewares`).join('\n- ')}`,
		);
	}
}
