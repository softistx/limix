import { definePlugin, type OnExecuteDone } from '@softistx/graxia';
import { onceClaims } from './claims';
import { isGuarded } from './guard';
import { checkOptions, type LimixGraxiaOptions } from './options';
import { remapPayload } from './remap';

/**
 * The graxia plugin of `guardSchema()`: adds `ctx.limix.claims()` (read once per
 * request), refuses to start on a schema `guardSchema()` did not make (its fields
 * would be open), and gives a refusal a resolver threw the same error a guarded
 * field answers, in every result: plain, each subscription event, each
 * `@defer`/`@stream` payload.
 *
 * ```ts
 * const options = { policy, claims: (ctx) => claimsOf(ctx) };
 * createGraxia({
 *   schema: guardSchema(schema, options),
 *   plugins: [limixGraxia(options)],
 * });
 * ```
 */
export function limixGraxia<Ctx = never>(options: LimixGraxiaOptions<Ctx>) {
	const wide = options as LimixGraxiaOptions<unknown>;
	checkOptions('limixGraxia()', options as LimixGraxiaOptions<never>);
	const remap = () => (done: OnExecuteDone) => {
		if (done.result !== undefined) {
			done.setResult(remapPayload(done.result, wide.mapRefusal));
		}
	};
	return definePlugin({
		name: 'limix',
		setup: ({ schema }) => {
			if (!isGuarded(schema)) {
				throw new TypeError(
					'limixGraxia(): the schema was not made by guardSchema(schema, options), so its fields would be open. Pass the guarded schema to createGraxia()',
				);
			}
		},
		onContext: ({ context }) => ({
			limix: { claims: onceClaims(() => wide.claims(context)) },
		}),
		onExecute: remap,
		onSubscribe: remap,
		onResultChunk: ({ chunk, setChunk }) => {
			const next = remapPayload(chunk, wide.mapRefusal);
			if (next !== chunk) setChunk(next);
		},
	});
}
