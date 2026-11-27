import type { LimixRefusal } from '@softistx/limix';
import { GraphQLError } from 'graphql';
import type { MapRefusal, RefusalAt } from './options';

/**
 * A refusal as a GraphQL error: the message is the code, `extensions.code` and
 * `status` carry it, `params` when there are some. A refused ROOT field also
 * asks for its HTTP status (`extensions.http`, a 503 with `retry-after`); a
 * nested refusal keeps the partial-data response at 200.
 */
export function refusalError(
	refusal: LimixRefusal,
	mapRefusal?: MapRefusal,
	at?: RefusalAt,
): GraphQLError {
	const mapped = mapRefusal?.(refusal, {
		type: at?.type ?? '',
		field: at?.field ?? '',
		...(at?.root === undefined ? {} : { root: at.root }),
	});
	const code = mapped?.code ?? refusal.code;
	const status = mapped?.status ?? refusal.status;
	const params = Object.keys(refusal.params).length > 0;
	return new GraphQLError(mapped?.message ?? code, {
		extensions: {
			code,
			status,
			...(params ? { params: refusal.params } : {}),
			...(at?.root
				? {
						http: {
							status,
							...(status === 503 ? { headers: { 'retry-after': '5' } } : {}),
						},
					}
				: {}),
		},
	});
}
