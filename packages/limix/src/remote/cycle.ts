import { errors, type JWTVerifyGetKey } from 'jose';
import type { Condition } from '../rules';
import { messageOf } from './deadline';
import { RemotePolicyError } from './errors';
import type { Holder } from './holder';
import type { Keys } from './keys';
import { pullSigned } from './pull';
import { saveStored, warnUntrustedKeys } from './stored';
import type { PolicyStore, RemotePolicyLogger } from './types';
import { type Verified, verifyPolicyToken } from './verify';

/** Everything one pull needs; no behaviour of its own. */
export interface CycleContext {
	url: string;
	token?: string | (() => string | Promise<string>);
	typ: string;
	conditions?: Readonly<Record<string, Condition>>;
	audience: string;
	issuer?: string;
	trustedKeys?: string[];
	timeoutMs: number;
	fetch: typeof fetch;
	now: () => number;
	keys: Keys;
	holder: Holder;
	store?: PolicyStore;
	logger: RemotePolicyLogger;
	fail: (error: RemotePolicyError) => void;
	/** Aborted by `stop()`: nothing is held, notified or written after it. */
	signal: AbortSignal;
	/** Settles when the store has been read. */
	restored: Promise<void>;
}

/** The typed error a failed fetch carried, even inside the key library's wrapper. */
const typed = (error: unknown): RemotePolicyError | undefined => {
	if (error instanceof RemotePolicyError) return error;
	const cause = (error as { cause?: unknown } | null)?.cause;
	if (!(cause instanceof RemotePolicyError)) return undefined;
	const outer = messageOf(error);
	// Keep the wrapper's message as context beside the typed error's own.
	return outer === cause.message
		? cause
		: new RemotePolicyError(cause.code, `${cause.message} (${outer})`, {
				cause,
			});
};

const wrap = (error: unknown) =>
	typed(error) ??
	new RemotePolicyError('FETCH_FAILED', messageOf(error), {
		cause: error,
	});

const REFUSALS = ['SIGNATURE', 'CLAIMS', 'RULES_REFUSED'];

/**
 * A provisional copy is checked against the live keys once they load: it is
 * promoted (its `ver` becomes the floor) or, when they refuse it, dropped.
 * Nothing changes once `signal` (the cycle's deadline, or `stop()`) aborted.
 */
async function settleProvisional(
	ctx: CycleContext,
	getKey: JWTVerifyGetKey,
	signal: AbortSignal,
) {
	const held = ctx.holder.get();
	if (!held?.provisional) return;
	try {
		await verifyPolicyToken(held.jws, getKey, {
			typ: ctx.typ,
			...(ctx.conditions ? { conditions: ctx.conditions } : {}),
			audience: ctx.audience,
			now: ctx.now(),
			ignoreExpiry: true,
			...(ctx.issuer ? { issuer: ctx.issuer } : {}),
		});
		if (signal.aborted) return;
		ctx.holder.promote();
	} catch (error) {
		// Only a real refusal drops the copy; any other fault keeps it provisional.
		if (
			!(error instanceof RemotePolicyError) ||
			!REFUSALS.includes(error.code)
		) {
			throw error;
		}
		if (signal.aborted) return;
		ctx.holder.drop();
		ctx.fail(
			new RemotePolicyError(
				'STORE',
				`the stored policy is refused by the live keys: ${error.message}`,
				{ cause: error },
			),
		);
	}
}

/**
 * Verifies the pulled token. A key the key set lacks, with the key set's URL
 * discovered, may mean the issuer moved it: discover again once, then retry.
 */
async function verifyPulled(
	ctx: CycleContext,
	jws: string,
	getKey: JWTVerifyGetKey,
	signal: AbortSignal,
): Promise<Verified> {
	const verify = (key: JWTVerifyGetKey) =>
		verifyPolicyToken(jws, key, {
			typ: ctx.typ,
			...(ctx.conditions ? { conditions: ctx.conditions } : {}),
			audience: ctx.audience,
			now: ctx.now(),
			...(ctx.issuer ? { issuer: ctx.issuer } : {}),
		});
	try {
		return await verify(getKey);
	} catch (error) {
		const missed =
			error instanceof RemotePolicyError &&
			error.cause instanceof errors.JWKSNoMatchingKey;
		if (!missed || !ctx.keys.rediscover()) throw error;
		return verify(await ctx.keys.resolver(signal));
	}
}

/** Keeps the accepted copy for a restart, when the store is set and the keys are known. */
async function persist(
	ctx: CycleContext,
	pulled: { jws: string; etag?: string },
) {
	const jwks = ctx.keys.jwks();
	if (!ctx.store || !jwks) return;
	if (ctx.trustedKeys) {
		await warnUntrustedKeys(jwks, ctx.trustedKeys, ctx.logger);
	}
	await saveStored(
		ctx.store,
		{ jws: pulled.jws, jwks, ...(pulled.etag ? { etag: pulled.etag } : {}) },
		ctx.fail,
		ctx.timeoutMs,
		ctx.signal,
	);
}

/** What a pull answers: whether the held rules changed, and why a failed pull failed. */
export interface PullResult {
	changed: boolean;
	error?: RemotePolicyError;
}

const UNCHANGED: PullResult = { changed: false };

/** One pull, verify, hold and store cycle. Never throws; `changed` is true when the rules changed. */
export async function pullOnce(ctx: CycleContext): Promise<PullResult> {
	try {
		// The deadline starts once the store is read, not while it is waited for.
		await ctx.restored;
		if (ctx.signal.aborted) return UNCHANGED;
		const signal = AbortSignal.any([
			ctx.signal,
			AbortSignal.timeout(ctx.timeoutMs),
		]);
		const getKey = await ctx.keys.resolver(signal);
		if (ctx.signal.aborted) return UNCHANGED;
		await settleProvisional(ctx, getKey, ctx.signal);
		if (ctx.signal.aborted) return UNCHANGED;
		const held = ctx.holder.get();
		const etag = held && !held.provisional ? held.etag : undefined;
		const pulled = await pullSigned({
			url: ctx.url,
			fetch: ctx.fetch,
			signal,
			timeoutMs: ctx.timeoutMs,
			...(ctx.token !== undefined ? { token: ctx.token } : {}),
			// A provisional copy is never confirmed by a 304: it must be re-verified live.
			...(etag ? { etag } : {}),
		});
		if (ctx.signal.aborted) return UNCHANGED;
		if (pulled.notModified) {
			if (!etag) {
				throw new RemotePolicyError(
					'HTTP_STATUS',
					`${ctx.url} answered 304 to a request without If-None-Match`,
				);
			}
			ctx.holder.confirm();
			return UNCHANGED;
		}
		const verified = await verifyPulled(ctx, pulled.jws, getKey, signal);
		if (ctx.signal.aborted) return UNCHANGED;
		const floor = ctx.holder.floor();
		if (verified.ver < floor) {
			throw new RemotePolicyError(
				'STALE_VERSION',
				`ver ${verified.ver} is lower than the held ver ${floor}`,
			);
		}
		const result = ctx.holder.hold(verified, {
			jws: pulled.jws,
			...(pulled.etag ? { etag: pulled.etag } : {}),
		});
		if (result.store) await persist(ctx, pulled);
		return { changed: result.changed };
	} catch (error) {
		if (ctx.signal.aborted) return UNCHANGED;
		const failure = wrap(error);
		ctx.fail(failure);
		return { changed: false, error: failure };
	} finally {
		// Whatever the outcome, a copy past `maxStaleMs` stops serving.
		if (!ctx.signal.aborted) ctx.holder.expire();
	}
}
