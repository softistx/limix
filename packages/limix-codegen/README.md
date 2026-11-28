# @softistx/limix-codegen

Build-time types for a code-first [`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md)
policy. It reads the API's operations (OpenAPI, GraphQL SDL) and writes one
TypeScript file that registers them, so `definePolicy` refuses a path, a method,
a GraphQL type or field the API does not have. That is its only job: it never
reads a policy (a YAML or JSON rules file included). It also writes a starter
`policy.ts`. A CLI and a graphql-codegen plugin; it runs on Bun.

## Install

The package is published with restricted access: installing it needs an npm
token that can read the `@softistx` scope.

```sh
bun add -d @softistx/limix-codegen @softistx/limix
```

`@softistx/limix` and `typescript` (6 or 7) are required peers. A file generated
by codegen 0.5 or later imports `RestRulesInput` and `GraphqlRulesInput`, so it
needs `@softistx/limix` 0.8 or later.
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
# write src/generated/limix.ts (--out <file> picks another)
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql

# the same, written elsewhere
limix-codegen generate --openapi openapi.yaml --out src/types/limix.ts

# CI: exit 1 when the committed file is missing or out of date, write nothing
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --check

# a starter policy, once: src/policy.ts, authenticated: true on every operation
limix-codegen init --openapi openapi.yaml --graphql schema.graphql

# the same, one key per operation ('GET /notes', 'Query.me')
limix-codegen init --openapi openapi.yaml --graphql schema.graphql --flat
```

As package.json scripts:

```json
{
  "scripts": {
    "limix:gen": "limix-codegen generate --openapi openapi.yaml --graphql schema.graphql",
    "limix:check": "limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --check"
  }
}
```

The file also exports `RestRules` and `GraphqlRules`, so a block of rules kept
in its own file is checked with `satisfies RestRules<'ownsBook'>` (see
[writing rules](docs/writing-rules.md#7-splitting-the-policy-across-files)).

A key is registered only when its input is given: without `--graphql`, GraphQL
rules stay unchecked. The output is sorted and byte-stable (LF, no date, no
version), so `--check` is a plain comparison. Exit codes: 0 done, 1 refused (or
`--check` found the file missing or out of date), 2 wrong command line.

## Writing the policy

Once the file is generated, `definePolicy` refuses a path, method, type or field
the API does not have, in the nested spelling and in the flat one (`'GET /notes'`,
`'Query.me'`, `'Note.*'`, which only `definePolicy` reads). Declare the names the
policy uses once, by hand: codegen does not read the policy, so it cannot
generate them.

```ts
// src/vocabulary.ts
declare module '@softistx/limix' {
  interface Register {
    role: 'admin' | 'editor'
    permission: 'notes:read' | 'notes:write'
  }
}
export {}
```

```ts
// src/policy.ts
import './generated/limix'
import './vocabulary'
import { definePolicy } from '@softistx/limix'

const conditions = { workingHours: () => true } // `satisfies ConditionMap`

export const rules = definePolicy(
  {
    limix: 1,
    global: { unmatched: 'deny' },
    rest: { 'GET /notes': { permissions: [['notes:read']] } },
    graphql: { 'Query.me': { roles: [['admin'], ['editor']], when: ['workingHours'] } },
  },
  { conditions },
)
```

`roles`, `permissions` and `when` are narrowed to the declared names. The
[Writing rules guide](docs/writing-rules.md) has the patterns table, what the
types check and do not, and nested against flat. The rules format itself is in
[`@softistx/limix`](../limix/docs/rules.md#typed-operations-and-names).

## The graphql-codegen plugin

```ts
// codegen.ts
export default {
  schema: 'schema.graphql',
  generates: {
    'src/generated/limix.ts': {
      plugins: ['@softistx/limix-codegen/graphql-codegen'],
      config: { openapi: 'openapi.yaml' },
    },
  },
}
```

Run it with `bun --bun graphql-codegen` when `openapi` is given: the plugin
reads those files through Bun. Keys other than `openapi` (graphql-codegen adds
its own) are ignored; there is no `rules` option on 0.4.

## Subpaths

| Subpath | What it holds |
| --- | --- |
| `@softistx/limix-codegen` | `generateModule`, `openapiOperations`, `starterPolicy`, `CodegenError` |
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

- [Writing rules](docs/writing-rules.md): generate, declare the vocabulary, typed `definePolicy` flat and nested, the patterns, what is checked, CI
- [Codegen](docs/codegen.md): what each registered key checks, what stays unchecked, the OpenAPI conversion, `init`, the plugin, and what 0.4 removed
- [Troubleshooting](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)
