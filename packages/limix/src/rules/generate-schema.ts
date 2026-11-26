import { z } from 'zod';
import { RulesSchema } from './schema';

type JsonSchema = Record<string, unknown>;

/**
 * The JSON schema of a rules document, generated from `RulesSchema`. The `x-`
 * keys are stripped by a preprocess step JSON Schema cannot express, so their
 * pattern is added here: editors accept them and still flag any other unknown
 * top-level key.
 *
 * Shared sub-schemas (the rule shapes, the relation terms) are emitted once
 * under `definitions` and referenced, which keeps the file small. The root is
 * inlined from its definition: `patternProperties` must sit beside
 * `additionalProperties: false`, not outside an `allOf` that would refuse it.
 */
export function rulesJsonSchema(): JsonSchema {
	const generated = z.toJSONSchema(RulesSchema, {
		target: 'draft-7',
		reused: 'ref',
	}) as JsonSchema;
	const { allOf, definitions, ...head } = generated;
	const rootRef = (allOf as { $ref: string }[] | undefined)?.[0]?.$ref;
	const rootName = rootRef?.replace('#/definitions/', '');
	const { [rootName ?? '']: root, ...rest } = (definitions ?? {}) as Record<
		string,
		JsonSchema
	>;
	if (!root)
		throw new Error('the generated JSON schema has no root definition');
	return {
		...head,
		...root,
		...(Object.keys(rest).length ? { definitions: rest } : {}),
		patternProperties: { '^x-': {} },
	};
}

export function rulesJsonSchemaText(): string {
	return `${JSON.stringify(rulesJsonSchema(), null, '\t')}\n`;
}
