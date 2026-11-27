# @softistx/limix-codegen

Build-time types for [`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md)
rules. It reads the API's operations (OpenAPI, GraphQL SDL) and the rules file,
and writes one TypeScript file that registers them, so `definePolicy` refuses a
path, a method, a GraphQL type or field the API does not have, and
`compilePolicy` a condition the rules file does not name. It also writes a
starter rules file. A CLI and a graphql-codegen plugin; it runs on Bun.

## Install

The package is published with restricted access: installing it needs an npm
token that can read the `@softistx` scope.

```sh
bun add -d @softistx/limix-codegen @softistx/limix
```

`@softistx/limix` and `typescript` (6 or 7) are required peers.
`@softistx/limix-graxia` and `graphql` are optional peers, needed only for
`--graphql` and the plugin. Installing `limix-graxia` brings `@softistx/graxia`
in as its own peer, but codegen never imports graxia: it reads
`@softistx/limix-graxia/operations`, which loads `graphql` alone.

```sh
bun add -d @softistx/limix-graxia graphql
```

Your tsconfig resolves as a bundler does (`"moduleResolution": "bundler"`), and
the generated file must be inside its `include`.

## The CLI

```sh
# write src/generated/limix.ts
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml

# CI: exit 1 when the committed file is out of date or a rule is stale, write nothing
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml --check

# a starter rules file, once: authenticated: true on every operation, unmatched: deny
limix-codegen init --openapi openapi.yaml --graphql schema.graphql

# the same, one key per operation ("GET /notes", "Query.me")
limix-codegen init --openapi openapi.yaml --graphql schema.graphql --flat
```

As package.json scripts:

```json
{
  "scripts": {
    "limix:gen": "limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml",
    "limix:check": "limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml --check"
  }
}
```

A key is registered only when its input is given: without `--graphql`, GraphQL
rules stay unchecked. The output is sorted and byte-stable (LF, no date, no
version), so `--check` is a plain comparison. Exit codes: 0 done, 1 refused (or
`--check` found a stale file or a stale rule), 2 wrong command line.

With `--rules` and an input to judge them against, `generate` also reports the
rules that reach no operation (a typo, a removed route, a rule shadowed by an
earlier one, an unknown type or field): a warning on stderr, and a failure under
`--check`, which on 0.2 judged no rules. Fix the rule, remove it, or add the
operation to the spec. A rules file that does not compile is reported and fails
`--check` too.

## Writing rules

Once the file is generated, `definePolicy` refuses a flat key
(`"GET /notes"`, `"Query.me"`, `"Note.*"`) the API does not have, as it does a
nested one, and `generate --check` catches the rest in CI:

```ts
import { definePolicy } from '@softistx/limix'

export const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { 'GET /notes': { authenticated: true } },
  graphql: { 'Query.me': { authenticated: true } },
})
```

The [Writing rules guide](docs/writing-rules.md) has the patterns table, what
the types check and do not, and nested against flat. The rules format itself is
in [`@softistx/limix`](../limix/docs/rules.md#typed-operations-and-names).

## The graphql-codegen plugin

```ts
// codegen.ts
export default {
  schema: 'schema.graphql',
  generates: {
    'src/generated/limix.ts': {
      plugins: ['@softistx/limix-codegen/graphql-codegen'],
      config: { rules: 'rules.yaml', openapi: 'openapi.yaml' },
    },
  },
}
```

Run it with `bun --bun graphql-codegen` when `rules` or `openapi` is given: the
plugin reads those files through Bun. Keys other than `rules` and `openapi`
(graphql-codegen adds its own) are ignored.

## Subpaths

| Subpath | What it holds |
| --- | --- |
| `@softistx/limix-codegen` | `generateModule`, `openapiOperations`, `starterRules`, `CodegenError` |
| `@softistx/limix-codegen/graphql-codegen` | `plugin`, the graphql-codegen plugin |
| `limix-codegen` (bin) | `generate` and `init` |
| `@softistx/limix-codegen/package.json` | The package manifest |

## Stability

After 1.0, a new issue `kind` or error code is a minor release: handle an
unknown one (a `default` branch) instead of closing the switch. The full policy
is in the core README's
[Stability](https://github.com/softistx/limix/blob/develop/packages/limix/README.md#stability)
section.

## Docs

- [Writing rules](docs/writing-rules.md): generate, typed `definePolicy` flat and nested, the patterns, what is checked, CI
- [Codegen](docs/codegen.md): what each registered key checks, what stays unchecked, the OpenAPI conversion, `init`, the plugin
- [Troubleshooting](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)
