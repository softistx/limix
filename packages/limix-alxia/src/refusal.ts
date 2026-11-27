import {
	type BaseContext,
	errorFormat,
	problem,
	problemOf,
	Reply,
} from '@softistx/alxia';
import type { LimixRefusal } from '@softistx/limix';
import type { MapRefusal, Refusal } from './options';

const PREFIXES = ['auth.errors.', 'tenancy.errors.'];

/**
 * The refusal an error stands for: an error carrying a string `code` under
 * `auth.errors.` or `tenancy.errors.` and a numeric `status`, as
 * `@softistx/alxia-access` reads one (a `TenancyError`, an `AccessError`).
 * `undefined` for anything else.
 */
export function refusalOfError(error: unknown): Refusal | undefined {
	if (typeof error !== 'object' || error === null) return undefined;
	const { code, status, params } = error as Record<string, unknown>;
	if (
		typeof code !== 'string' ||
		typeof status !== 'number' ||
		!PREFIXES.some((prefix) => code.startsWith(prefix))
	) {
		return undefined;
	}
	const given =
		typeof params === 'object' && params !== null
			? (params as Record<string, unknown>)
			: {};
	return { code, status, params: given };
}

type Status = Parameters<typeof problem>[0]['status'];

function checkedStatus(status: number): Status {
	if (!Number.isInteger(status) || status < 400 || status > 599) {
		throw new TypeError(
			`limix-alxia: a refusal's status is an HTTP error status (400 to 599), not ${status}`,
		);
	}
	// A number the check above bounded: alxia types its error statuses as a union of literals.
	return status as Status;
}

/**
 * The refusal in the format the app answers its errors in: `{ code, params? }`
 * as JSON, or a problem (`detail` the code, `code` and `params` as extensions).
 * A 503 carries `retry-after: 5`. `mapRefusal` may reword it, or answer itself.
 */
export function answer<Ctx extends object>(
	ctx: BaseContext & Ctx,
	refusal: Refusal | LimixRefusal,
	mapRefusal: MapRefusal<Ctx> | undefined,
): Reply | Response {
	const mapped = mapRefusal?.(refusal, ctx);
	if (mapped instanceof Response) return mapped;
	const code = mapped?.code ?? refusal.code;
	const status = checkedStatus(mapped?.status ?? refusal.status);
	const params = Object.keys(refusal.params).length > 0 ? refusal.params : null;
	const init = status === 503 ? { headers: { 'retry-after': '5' } } : undefined;
	if (errorFormat(ctx) === 'problem') {
		return problem(
			problemOf(ctx, {
				status,
				detail: mapped?.detail ?? code,
				code,
				...(params ? { params } : {}),
			}),
			init,
		);
	}
	return new Reply(
		status,
		{
			code,
			...(mapped?.detail === undefined ? {} : { message: mapped.detail }),
			...(params ? { params } : {}),
		},
		init,
	);
}
