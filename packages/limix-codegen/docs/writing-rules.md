# Writing rules

How to write a `definePolicy` call so that the compiler and CI catch what they
can. It assumes you know the format: the [rules guide](../../limix/docs/rules.md)
has the full reference. Codegen types a code-first policy; a YAML or JSON rules
file is not typed by it (check one against the API with
`@softistx/limix/coverage`).

## 1. Generate the types

```sh
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql
```

This writes `src/generated/limix.ts`, which registers the API's operations in
`@softistx/limix`. Commit it and keep it inside your tsconfig `include`. More in
[Codegen](codegen.md). Or start from `limix-codegen init`, which writes this
guide's step 2 for you (`src/policy.ts`).

## 2. Declare the vocabulary

The role, permission and condition names a policy may use are declared once, by
hand, in a `declare module` block. Codegen cannot generate them: it never reads
the policy.

```ts
// src/vocabulary.ts
declare module '@softistx/limix' {
  interface Register {
    role: 'admin' | 'editor'
    permission: 'notes:read' | 'notes:write'
    // condition: 'workingHours' // optional, see below
  }
}
export {}
```

Once declared, `roles`, `permissions` and `when` are narrowed: a role or a
permission outside the union fails to compile. The conditions need no
declaration when you pass them to `definePolicy`, which reads their keys (see
the next step); declare `condition` only to fix the names for a policy that does
not pass them. Declare the vocabulary **after** regenerating from 0.3 (see
[Upgrading from 0.3](codegen.md#upgrading-from-03)), and never inside the
generated file: `generate` rewrites it.

## 3. Write the policy in code

`definePolicy` checks an inline literal against the registered operations, in
the nested form and in the flat one, and against the vocabulary:

```ts
import './generated/limix'
import './vocabulary'
import { type ConditionMap, definePolicy } from '@softistx/limix'

const conditions = {
  workingHours: ({ claims }) => claims['shift'] === 'day',
} satisfies ConditionMap

export const rules = definePolicy(
  {
    limix: 1,
    global: { unmatched: 'deny' },
    rest: {
      // flat: one key per operation
      'GET /notes': { permissions: [['notes:read']] },
      'DELETE /notes/:id': { roles: [['admin']], when: ['workingHours'] },
      // nested: a path, then its methods
      '/notes/:id': { GET: { authenticated: true } },
    },
    graphql: {
      'Query.me': { authenticated: true },
      Note: { body: { permissions: [['notes:read']] } },
    },
  },
  { conditions },
)
// and, where the policy is compiled:
//   compilePolicy(rules, { conditions })
```

`definePolicy` never calls a condition: it reads the keys of
`options.conditions` to type `when`, and you give the same object to
`compilePolicy`, which runs it. `definePolicy<typeof conditions>({...})` does
the same without the second argument. A key the API does not have, or a name
nobody declared, fails to compile:

```ts
definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  // error: 'GET /notez' does not exist in type 'CheckedRestInput<...>'
  rest: { 'GET /notez': { authenticated: true } },
})
```

What `definePolicy` returns is the nested, validated `Rules` (flat keys nested
in document order); a rule written twice, or a flat key whose move up to an
earlier path would jump over a rule that could answer the same request, throws a
`RulesError` ([rules guide](../../limix/docs/rules.md#flat-keys-in-definepolicy)).

## 4. The patterns

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

## 5. What the types check, and what they do not

- Checked: an exact flat key (`'GET /notes'`, `'Query.me'`), a nested path and
  the methods under it, a type and its fields, `Type.*` on a known type, and the
  names in `roles`, `permissions` and `when` against what you declared (the keys
  of `conditions` for `when`).
- Not checked by the types: a key holding `*` or `{` (`'* /notes'`,
  `'/files/*path'`, `'GET /a{/:b}'`) names several routes. Coverage checks them
  instead: it reports a rule that reaches no operation of the spec.
- Only an inline object literal given to `definePolicy` is checked. A variable, a
  spread or a parsed file is accepted unchecked; for those, coverage is the net.
- The lists of `roles` and `permissions` are mutable in the types: a literal
  written `as const` is refused once names are declared. Write it inline.

## 6. Nested or flat

Both compile to the same policy and may be mixed in one file, in document order.

| | Nested | Flat |
| --- | --- | --- |
| REST | `'/notes/:id': { GET: rule, DELETE: rule }` | `'GET /notes/:id': rule`, `'DELETE /notes/:id': rule` |
| GraphQL | `Query: { me: rule }` | `'Query.me': rule` |
| Reads well | a few paths with many methods | one rule per operation, a diff per operation |

`limix-codegen init --flat` starts a policy in the flat form. The rules format
(a YAML or JSON file) is nested only: the flat keys exist in `definePolicy`.

## 7. Splitting the policy across files

A long policy can keep each concern in its own file. The generated file exports
`RestRules` and `GraphqlRules`, so a block is checked where it is written. List
the condition names `when` may use once, in a file of types, so a block needs no
import of the conditions' code:

```ts
// src/policy/conditions.ts
export type BooksCondition = 'ownsBook'

// src/policy/books.rest.ts
import type { RestRules } from '../generated/limix'
import type { BooksCondition } from './conditions'

export const booksRest = {
  'GET /books': { public: true },
  '/books/:id': { PUT: { roles: [['editor']], when: ['ownsBook'] } },
} satisfies RestRules<BooksCondition>

// src/policy/admin.ts: the public health check before the wildcard
export const adminRest = {
  'GET /admin/health': { public: true },
  '* /admin/*': { roles: [['admin']] },
} satisfies RestRules<never>

// src/policy.ts
const rules = definePolicy(
  { limix: 1, global: { unmatched: 'deny' }, rest: [booksRest, adminRest], graphql: booksGraphql },
  { conditions },
)
```

An unknown path, method, role, permission or condition in a block is a compile
error in that block. List order is first-match order, and a rule written in two
blocks is refused: see "Splitting a policy across files" in the
[rules guide](../../limix/docs/rules.md#splitting-a-policy-across-files). A
variable typed `Rest | readonly Rest[]` matches no `definePolicy` overload:
narrow it first. A mistake in a block written inline in the list is reported on
the `rest:` key (`No overload matches this call`, ending with `Index signature
for type …`): write each block in its own constant or file, `satisfies RestRules`, as
above, and the error shows in the block (`satisfies` inside the list does not
move it)
([troubleshooting](../../limix/docs/troubleshooting.md#index-signature-for-type-stringstring-is-missing-in-type-)). The starter `init` writes stays one file.

## 8. In CI

```sh
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --check
```

Exit 1 when the committed types are missing or out of date. Whether every route
and root field has a rule, and whether a rule reaches no operation (a typo, a
removed route, a rule shadowed by an earlier one), is coverage's job: run it in a
spec, as [the books example](../../../examples/books/src/coverage.spec.ts) does.
Each message and its fix: [Troubleshooting](troubleshooting.md).
