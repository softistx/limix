import { z } from 'zod';
import { RulesSchema } from './schema';

/**
 * The JSON schema of a rules document, generated from `RulesSchema`. The `x-`
 * keys are stripped by a preprocess step JSON Schema cannot express, so their
 * pattern is added here: editors accept them and still flag any other unknown
 * top-level key.
 */
export function rulesJsonSchema(): Record<string, unknown> {
	const generated = z.toJSONSchema(RulesSchema, { target: 'draft-7' });
	return { ...generated, patternProperties: { '^x-': {} } };
}

export function rulesJsonSchemaText(): string {
	return `${JSON.stringify(rulesJsonSchema(), null, '\t')}\n`;
}
