import { defineMiddleware, type Empty, markFactory } from '@softistx/alxia';
import {
	type Claims,
	evaluateRest,
	isLimixRefusal,
	isPolicySource,
	type RelationChecker,
} from '@softistx/limix';
import { claimApp, declaredRoutes, endpointTest } from './endpoints';
import { makeHeld } from './held';
import { checkOptions, type LimixAlxiaOptions } from './options';
import { answer, refusalOfError } from './refusal';
import { restCall } from './request';
import { rungCodeProblems } from './setup-check';

/** What the claims function and the relations function read: one request's context. */
async function who<Ctx extends object>(
	options: LimixAlxiaOptions<Ctx>,
	ctx: Ctx,
	usesRelations: boolean,
): Promise<{ claims: Claims; relations: RelationChecker | undefined }> {
	const claims = await options.claims(ctx);
	const { relations } = options;
	if (typeof relations !== 'function') return { claims, relations };
	return { claims, relations: usesRelations ? relations(ctx) : undefined };
}

/**
 * The middleware that judges every request that reached a route by the rules:
 * `app.use(limixGuard({ policy, claims, app }))`, before the routes it guards.
 * It throws when the app already holds a route (a `limixGraphql` endpoint
 * aside): a route declared before the guard never runs it. A refusal is answered in the app's error format (401, 403, 404 by the rule;
 * 503 when no fitting policy is held), a request that reached no route is left
 * to alxia's 404, 405 or 426, and the endpoints `limixGraphql` declared are
 * left to their field guard.
 */
export function limixGuard<Ctx extends object = Empty>(
	options: LimixAlxiaOptions<Ctx>,
) {
	checkOptions('limixGuard()', options as LimixAlxiaOptions<never>);
	const { policy, app, mapRefusal } = options;
	if (!isPolicySource(policy)) {
		const problems = rungCodeProblems(policy);
		if (problems.length > 0) {
			throw new TypeError(
				`limixGuard(): the policy does not fit:\n- ${problems.join('\n- ')}`,
			);
		}
	}
	const early = declaredRoutes(app);
	if (early.length > 0) {
		throw new TypeError(
			`limixGuard(): routes declared before the guard never run it and stay open: ${early.join(', ')}. Declare the guard first, then the routes: \`app.use(limixGuard({ ..., app }))\` before them; a health route gets a \`public: true\` rule`,
		);
	}
	claimApp(app);
	const isExempt = endpointTest(app);
	const held = makeHeld(options as LimixAlxiaOptions<never>, () => middleware);
	const middleware = defineMiddleware<Ctx>()(async (ctx, next) => {
		const { route } = ctx;
		if (route === undefined) return next();
		const upgrade =
			ctx.request.headers.get('upgrade')?.toLowerCase() === 'websocket';
		if (isExempt(ctx.request.method, route, upgrade)) return next();
		const rules = held.snapshot();
		if (isLimixRefusal(rules)) return answer(ctx, rules, mapRefusal);
		try {
			const { claims, relations } = await who(
				options,
				ctx,
				rules.usesRelations,
			);
			const call = await restCall(ctx, route, rules);
			const decision = await evaluateRest(rules, {
				...call,
				claims,
				relations,
				info: ctx,
			});
			if (!decision.allow) return answer(ctx, decision.refusal, mapRefusal);
		} catch (error) {
			const refusal = refusalOfError(error);
			if (!refusal) throw error;
			return answer(ctx, refusal, mapRefusal);
		}
		return next();
	});
	return middleware;
}
markFactory(limixGuard);
