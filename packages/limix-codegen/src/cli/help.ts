export const MAIN_HELP = `limix-codegen: types for limix rules from the API's operations and the rules file

Usage: limix-codegen <command> [options]

Commands:
  generate   write the types that register the operations and the rule names
  init       write a starter rules file from the operations (never overwrites)

Run "limix-codegen <command> --help" for a command's options.
Exit codes: 0 done, 1 refused (or --check found a stale file), 2 wrong command line.
`;

export const GENERATE_HELP = `Usage: limix-codegen generate [--graphql <sdl>]... [--openapi <spec>]... [--rules <rules.yaml|json>] [options]

Writes a TypeScript file that registers, in @softistx/limix, the operations of
the API (rest from OpenAPI, graphql from SDL) and the permission, role and
condition names of the rules file. Give at least one input; a key whose input
is not given stays unchecked. The output is sorted and byte-stable.

Options:
  --graphql <file>    a GraphQL SDL file; repeat for several (needs @softistx/limix-graxia and graphql)
  --openapi <file>    an OpenAPI or Swagger 2 document, .yaml, .yml or .json; repeat for several
  --rules <file>      the rules file, .yaml, .yml or .json
  --out <file>        the file to write; default src/generated/limix.ts
  --check             write nothing: exit 1 when the file is missing or out of date
  -h, --help          show this help
`;

export const INIT_HELP = `Usage: limix-codegen init [--graphql <sdl>]... [--openapi <spec>]... [--rules <rules.yaml|json>]

Writes a starter rules file: every REST operation and every GraphQL root field
gets \`authenticated: true\`, under \`unmatched: deny\`. It never rewrites an
existing file: new operations show up as uncovered in coverage.

Options:
  --graphql <file>    a GraphQL SDL file; repeat for several (needs @softistx/limix-graxia and graphql)
  --openapi <file>    an OpenAPI or Swagger 2 document, .yaml, .yml or .json; repeat for several
  --rules <file>      the file to write (the format follows .yaml, .yml or .json); default rules.yaml
  -h, --help          show this help
`;
