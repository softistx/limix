import { definePlugin, type Empty, type OnExecuteDone } from '@softistx/graxia';
import { pluginContext } from './claims';
import { isGuarded } from './guard';
import { checkOptions, type LimixGraxiaOptions } from './options';
import { remapPayload } from './remap';

/**
 * The graxia plugin of `guardSchema()`: adds `ctx.limix.claims()` (read once per
 * operation), refuses to start on a schema `guardSchema()` did not make (its fields
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
export function limixGraxia<Ctx extends object = Empty>(
	options: LimixGraxiaOptions<Ctx>,
) {
	checkOptions('limixGraxia()', options);
	const remap = () => (done: OnExecuteDone) => {
		if (done.result !== undefined) {
			done.setResult(remapPayload(done.result, options.mapRefusal));
		}
	};
	return definePlugin<Ctx>()({
		name: 'limix',
		setup: ({ schema }) => {
			if (!isGuarded(schema)) {
				throw new TypeError(
					'limixGraxia(): the schema was not made by guardSchema(schema, options), so its fields would be open. Pass the guarded schema to createGraxia()',
				);
			}
		},
		onContext: ({ context }) =>
			pluginContext(
				() => options.claims(context),
				() => {
					const { relations } = options;
					return typeof relations === 'function'
						? relations(context)
						: relations;
				},
			),
		onExecute: remap,
		onSubscribe: remap,
		onResultChunk: ({ chunk, setChunk }) => {
			const next = remapPayload(chunk, options.mapRefusal);
			if (next !== chunk) setChunk(next);
		},
	});
}
