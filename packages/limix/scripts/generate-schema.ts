import { rulesJsonSchemaText } from '../src/rules/generate-schema';

const out = new URL('../schema/rules.schema.json', import.meta.url);
await Bun.write(out, rulesJsonSchemaText());
console.log(`Wrote ${out.pathname}`);
