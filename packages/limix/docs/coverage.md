# Coverage

A rules file protects what it names. Whether it names everything is a question
for a test, not for a review. `coverage(policy, operations)` answers it: given
the operations your API exposes, it says which a rule covers, which are public,
which no rule names, and which rules name nothing that exists.

It lives on its own subpath, `@softistx/limix/coverage`, which imports no
`node:` module and no package: it runs in a browser (a rules editor) or an edge
runtime as well as in CI.

```ts
import { compilePolicy, loadRules } from '@softistx/limix'
import { coverage, type Operation } from '@softistx/limix/coverage'

const policy = compilePolicy(await loadRules('rules.yaml'))

const operations: Operation[] = [
  { kind: 'rest', method: 'GET', path: '/documents/:id' },
  { kind: 'graphql', type: 'Query', field: 'me', root: true },
]

const report = coverage(policy, operations)
```

## The operation list

Coverage reads a neutral list; the integrations build it from what they know
(the GraphQL schema, the route table, an OpenAPI spec), and a hand-written
array works too.

| Operation | Fields |
| --- | --- |
| REST | `{ kind: 'rest', method, path }` |
| GraphQL | `{ kind: 'graphql', type, field, root }` |

`method` is any case. `path` is the route **pattern in the rules-file
spelling**: `/documents/:id`, with the parameter names the rules file uses. It
may carry `global.basePath` or not, like `route` of `evaluateRest`. A route
written another way (`/documents/{id}` from an OpenAPI path, or `/documents/:docId`
against a rule on `:id`) names no rule: the operation is `uncovered` and the
rule is `stale`. Convert the path to the rules-file spelling when you build the
list.

`root` says whether `type` is an operation root, so `global.unmatched` governs
its fields, as `root` of `evaluateField`. Read it from the schema: a schema that
renames `Query` to `RootQuery` still has a root, and any other type is not one.

## The report

| Field | Meaning |
| --- | --- |
| `operations[]` | One entry per operation, in your order: `{ operation, label, status, unmatched? }` |
| `status: 'covered'` | A rule names the operation and asks something of the caller |
| `status: 'public'` | A rule names it and says `public: true` |
| `status: 'uncovered'` | No rule names it, so it falls to `global.unmatched` |
| `unmatched` | On `uncovered` only: `'allow'` or `'deny'`, what `global.unmatched` does to it. A GraphQL field that is not a root is never governed by it, so it is always `allow` |
| `stale[]` | Rules that reach no operation: `{ kind: 'rest', method, path, label }` or `{ kind: 'graphql', type, field, label }`, `path` as the rules file spells it |
| `summary` | Counts: `total`, `covered`, `public`, `uncovered`, `refused` (uncovered with `unmatched: 'deny'`), `stale` |

`label` is `GET /documents/:id` or `Query.me`, ready to print.

"Uncovered" is a statement about the rules file, not about the guard: under
`unmatched: allow` an uncovered operation is open, under `deny` it is refused.
`summary.refused` is the number to bring to zero before turning `deny` on.

REST operations are matched by the code `evaluateRest` uses, so the report and
the guard cannot disagree: the same `global.basePath` handling, and `HEAD`
faces its own rules and then the `GET` ones. A `HEAD` operation is `public` only
when every rule it faces is, and it is `uncovered` when no `GET` rule names it,
even beside a `HEAD` rule (the guard refuses it under `deny`).

Stale rules are judged per transport, and only when the list holds an operation
of it: a GraphQL-only list does not make every REST rule stale, nor the reverse,
and an empty list judges nothing. For GraphQL a rule is judged when its type is
named by the list or is `Query`, `Mutation` or `Subscription`; a rule on a type
the list never mentions is left alone.

An entry that is not an `Operation` throws a `TypeError` (see
[troubleshooting](troubleshooting.md)).

## A CI check

A script that fails the build on an uncovered operation or a stale rule. List
the operations from your integration; here, by hand:

```ts
// scripts/check-coverage.ts
import { compilePolicy, loadRules } from '@softistx/limix'
import { coverage } from '@softistx/limix/coverage'
import { operations } from './operations' // your list

const policy = compilePolicy(await loadRules('rules.yaml'))
const report = coverage(policy, operations)

const uncovered = report.operations.filter((entry) => entry.status === 'uncovered')
for (const entry of uncovered) {
  console.error(`uncovered (${entry.unmatched}): ${entry.label}`)
}
for (const rule of report.stale) console.error(`stale: ${rule.label}`)

console.log(report.summary)
if (uncovered.length > 0 || report.stale.length > 0) process.exit(1)
```

Or as a test, which keeps the file exhaustive:

```ts
import { expect, test } from 'bun:test'

test('the rules name every operation and nothing else', () => {
  const report = coverage(policy, operations)
  expect(report.operations.filter((entry) => entry.status === 'uncovered')).toEqual([])
  expect(report.stale).toEqual([])
})
```

Get `uncovered` to zero, then set `global.unmatched: deny`; the check keeps it
there. If your list includes GraphQL fields that are not roots and you want them
open, filter them out of the failure (`entry.unmatched === 'deny'` keeps only
what the guard would refuse).

## In a browser

The same function in a rules editor, with no Node:

```ts
const { summary } = coverage(compilePolicy(rules), operations)
```
