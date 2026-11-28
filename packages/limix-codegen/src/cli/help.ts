export const MAIN_HELP = `limix-codegen: types for a code-first limix policy, from the API's operations

Usage: limix-codegen <command> [options]

Commands:
  generate   write the types that register the API's operations
  init       write a starter policy.ts from the operations (never overwrites)

Run "limix-codegen <command> --help" for a command's options.
Exit codes: 0 done, 1 refused (or --check found the file missing or out of date), 2 wrong command line.
`;

export const GENERATE_HELP = `Usage: limix-codegen generate [--graphql <sdl>]... [--openapi <spec>]... [options]

Writes a TypeScript file that registers, in @softistx/limix, the operations of
the API (rest from OpenAPI, graphql from SDL), so that definePolicy refuses a
path, method, type or field the API does not have. Give at least one input; a
key whose input is not given stays unchecked. The output is sorted and
byte-stable. It never reads a policy: declare the role, permission and
condition names by hand (see the docs).

Options:
  --graphql <file>    a GraphQL SDL file; repeat for several (needs @softistx/limix-graxia and graphql)
  --openapi <file>    an OpenAPI or Swagger 2 document, .yaml, .yml or .json; repeat for several
  --out <file>        the file to write; default src/generated/limix.ts
  --check             write nothing: exit 1 when the file is missing or out of date
  -h, --help          show this help
`;

export const INIT_HELP = `Usage: limix-codegen init [--graphql <sdl>]... [--openapi <spec>]... [--out <policy.ts>] [--types <generated.ts>] [--flat]

Writes a starter policy.ts: a definePolicy call in which every REST operation
and every GraphQL root field gets \`authenticated: true\`, under
\`unmatched: 'deny'\`. It never rewrites an existing file: new operations show
up as uncovered in coverage. With --flat each operation is one key
('GET /notes', 'Query.me') instead of a path or a type that holds its methods
or fields.

Options:
  --graphql <file>    a GraphQL SDL file; repeat for several (needs @softistx/limix-graxia and graphql)
  --openapi <file>    an OpenAPI or Swagger 2 document, .yaml, .yml or .json; repeat for several
  --out <file>        the policy to write, a .ts file; default src/policy.ts
  --types <file>      the file \`generate\` writes, imported by the policy; default src/generated/limix.ts
  --flat              one key per operation ('GET /notes', 'Query.me')
  -h, --help          show this help
`;
