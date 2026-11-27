import { isLimixRefusal } from '@softistx/limix';
import { GraphQLError } from 'graphql';
import type { MapRefusal } from './options';
import { refusalError } from './refusal';

/** The errors this module made, so a result that passes two hooks is converted once. */
const made = new WeakSet<GraphQLError>();

function fieldOf(error: GraphQLError): string {
	const node = error.nodes?.[0];
	if (node?.kind === 'Field') return node.name.value;
	const last = error.path?.findLast((key) => typeof key === 'string');
	return typeof last === 'string' ? last : '';
}

/** A refusal a resolver threw, as the error `guardSchema` would have made, at the same place. */
function converted(error: unknown, mapRefusal?: MapRefusal): unknown {
	if (!(error instanceof GraphQLError) || made.has(error)) return error;
	const refusal = error.originalError;
	if (!isLimixRefusal(refusal)) return error;
	const fresh = refusalError(refusal, mapRefusal, {
		type: '',
		field: fieldOf(error),
		root: error.path?.length === 1,
	});
	const out = new GraphQLError(fresh.message, {
		nodes: error.nodes,
		path: error.path,
		extensions: fresh.extensions,
	});
	made.add(out);
	return out;
}

function each(list: unknown, convert: (item: unknown) => unknown): unknown {
	if (!Array.isArray(list)) return list;
	const next = list.map(convert);
	return next.some((item, i) => item !== list[i]) ? next : list;
}

/**
 * One result, or one chunk of a stream, with every refusal a resolver threw
 * turned into its GraphQL error: the top-level `errors` and those of each
 * `incremental` and `completed` entry. Returns the value itself when nothing
 * changed; a stream or a non-result is left alone.
 */
export function remapPayload<T>(value: T, mapRefusal?: MapRefusal): T {
	if (typeof value !== 'object' || value === null) return value;
	if (Symbol.asyncIterator in value) return value;
	const record = value as Record<string, unknown>;
	const out: Record<string, unknown> = {};
	const errors = each(record['errors'], (e) => converted(e, mapRefusal));
	if (errors !== record['errors']) out['errors'] = errors;
	for (const key of ['incremental', 'completed']) {
		const entries = each(record[key], (entry) =>
			remapPayload(entry, mapRefusal),
		);
		if (entries !== record[key]) out[key] = entries;
	}
	return Object.keys(out).length > 0 ? ({ ...record, ...out } as T) : value;
}
