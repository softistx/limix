# Writing rules

How to write a rules file, or a `definePolicy` call, so that the compiler and CI
catch what they can. It assumes you know the format: the
[rules guide](../../limix/docs/rules.md) has the full reference.

## 1. Generate the types

```sh
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml
```

This writes `src/generated/limix.ts`, which registers the API's operations in
`@softistx/limix`. Commit it and keep it inside your tsconfig `include`. More in
[Codegen](codegen.md).

## 2. Write the rules in code

`definePolicy` checks an inline literal against the registered operations, in
the nested form and in the flat one:

```ts
import { definePolicy } from '@softistx/limix'

export const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    // flat: one key per operation
    'GET /notes': { authenticated: true },
    'DELETE /notes/:id': { roles: [['admin']] },
    // nested: a path, then its methods
    '/notes/:id': { GET: { authenticated: true } },
  },
  graphql: {
    'Query.me': { authenticated: true },
    Note: { body: { authenticated: true } },
  },
})
```

A key the API does not have fails to compile:

```ts
definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  // error: 'GET /notez' does not exist in type 'CheckedRestInput<LimixRest>'
  rest: { 'GET /notez': { authenticated: true } },
})
```

## 3. The patterns

| Pattern | Means | Example |
| --- | --- | --- |
| `:id` | One path segment, captured | `GET /notes/:id` |
| `*name` | The rest of the path, captured | `GET /files/*path` |
| bare `*` | The rest of the path, not captured | `GET /admin/*` |
| `{...}` | An optional group | `GET /a{/:b}` |
| method `*` | Any method on the path | `* /notes`, or `'/notes': { '*': rule }` |
| `Type.*` | Every field of the type with no rule of its own | `Note.*` |

Each pattern is described, with its edge cases, in the
[rules guide](../../limix/docs/rules.md). Rules are first-match in document
order: write the specific rule above the general one.

## 4. What the types check, and what they do not

- Checked: an exact flat key (`'GET /notes'`, `'Query.me'`), a nested path and
  the methods under it, a type and its fields, `Type.*` on a known type, and the
  keys of the `conditions` map of `compilePolicy`.
- Not checked by the types: a key holding `*` or `{` (`'* /notes'`,
  `'/files/*path'`, `'GET /a{/:b}'`) names several routes. `generate --check`
  checks them instead: it reports one that reaches no operation of the spec.
- The bodies are not narrowed: `permissions`, `roles` and `when` stay strings.
- Only an inline object literal given to `definePolicy` is checked. A variable, a
  spread or a parsed file is accepted unchecked; for those, `--check` is the
  net.

## 5. Nested or flat

Both compile to the same policy and may be mixed in one file, in document order.

| | Nested | Flat |
| --- | --- | --- |
| REST | `'/notes/:id': { GET: rule, DELETE: rule }` | `'GET /notes/:id': rule`, `'DELETE /notes/:id': rule` |
| GraphQL | `Query: { me: rule }` | `'Query.me': rule` |
| Reads well | a few paths with many methods | one rule per operation, a diff per operation |

`limix-codegen init --flat` starts a rules file in the flat form.

## 6. In CI

```sh
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql \
  --rules rules.yaml --check
```

Exit 1 when the committed types are out of date, or when a rule reaches no
operation of the spec (a typo, a removed route, a rule shadowed by an earlier
one). Without `--check` the same stale rules are warnings and the file is
written. Each message and its fix: [Troubleshooting](troubleshooting.md).
