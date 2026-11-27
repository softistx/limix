# @softistx/limix-codegen

Build-time types for [`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md)
rules. It reads the API's operations (OpenAPI, GraphQL SDL) and the rules file,
and writes one TypeScript file that registers them, so `definePolicy` refuses a
path, a method, a GraphQL type or field the API does not have, and
`compilePolicy` a condition the rules file does not name. It also writes a
starter rules file. A CLI and a graphql-codegen plugin; it runs on Bun.

## Install

Not published yet: this package and `@softistx/limix-graxia` are private until
the first release.

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

# CI: exit 1 when the committed file is out of date, write nothing
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml --check

# a starter rules file, once: authenticated: true on every operation, unmatched: deny
limix-codegen init --openapi openapi.yaml --graphql schema.graphql
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
`--check` found a stale file), 2 wrong command line.

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
| `@softistx/limix-codegen` | `generateModule`, `openapiOperations`, `openapiPath`, `starterRules`, `CodegenError` |
| `@softistx/limix-codegen/graphql-codegen` | `plugin`, the graphql-codegen plugin |
| `limix-codegen` (bin) | `generate` and `init` |
| `@softistx/limix-codegen/package.json` | The package manifest |

## Docs

- [Codegen](docs/codegen.md): what each registered key checks, what stays unchecked, the OpenAPI conversion, `init`, the plugin
- [Troubleshooting](docs/troubleshooting.md)
- [Roadmap](docs/roadmap.md)
