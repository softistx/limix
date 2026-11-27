# Coverage

A rules file protects what it names. Whether it names everything is a question
for a test, not for a review. `coverage(policy, operations)` answers it: given
the operations your API exposes, it says which a rule covers, which are public,
which no rule names, and which rules name nothing that exists.

It lives on its own subpath, `@softistx/limix/coverage`, which imports no
`node:` module and no package at all: it runs in a browser (a rules editor) or an edge
runtime as well as in CI. The main entry `@softistx/limix` imports no `node:`
module either; only `loadRules`, on `@softistx/limix/bun`, reads the disk. A
spec of the repository follows the source imports of both entries and fails on
a `node:` or `bun:` one.

```ts
import { compilePolicy } from '@softistx/limix'
import { loadRules } from '@softistx/limix/bun'
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

`method` is any case. `path` is best written as the route **pattern in the
rules-file spelling**: `/documents/:id`. It may carry `global.basePath` or not,
like `route` of `evaluateRest`. A path spelled another way (`/documents/{id}`
from an OpenAPI path, or `/documents/:docId` against a rule on `:id`) is still
reached, as a request would be: the rule's matcher takes it, the entry reads
`match: 'pattern'`, and the rule is used, never stale. Bring such spellings into
line: `rulesPathOf` converts an OpenAPI path.

`match: 'pattern'` says only that the rule's matcher takes that one spelling of
the path, as `evaluateRest` would for a request with it. It does not promise
more: an operation path holding a wildcard (`/files/*path`) or an optional group
with a parameter (`/things{/:id}`) stands for several request shapes, so a
matcher hit is never claimed for it. It is `uncovered` unless a rule spells it
exactly (a rule `GET /files/:name` does not cover `GET /files/*path`; the rule is
stale when no other operation uses it). Single-segment parameters
(`/things/:thingId`) stay allowed as pattern hits.

`rulesPathOf` converts only whole `{name}` segments. An operation from
`rulesPathOf('/things/{id}.json')` stays `/things/{id}.json`, so a rule written
with the in-segment suffix (`/things/:id.json`) beside `/things/:id` can be
reported stale: the operation is reached by the `/things/:id` rule's matcher,
not by the suffixed one. Spell that operation as the rule does.

```ts
import { rulesPathOf } from '@softistx/limix/coverage'

rulesPathOf('/documents/{id}') // '/documents/:id'
```

A bare `{name}` segment becomes `:name`; any other segment (`{name}.json`
included) is left as it is.

`root` says whether `type` is an operation root, so `global.unmatched` governs
its fields, as `root` of `evaluateField`. Read it from the schema: a schema that
renames `Query` to `RootQuery` still has a root, and any other type is not one.

## The report

| Field | Meaning |
| --- | --- |
| `operations[]` | One entry per operation, in your order: `{ operation, label, status, match?, unmatched? }` |
| `status: 'covered'` | A rule names the operation and asks something of the caller |
| `status: 'public'` | A rule names it and says `public: true` |
| `status: 'uncovered'` | No rule names it, so it falls to `global.unmatched` |
| `match` | On `covered` and `public` REST entries: `'exact'` when the rule's own pattern names the path, `'pattern'` when another spelling, or an earlier rule's matcher, took it |
| `unmatched` | On `uncovered` only: `'allow'` or `'deny'`, what `global.unmatched` does to it. A GraphQL field that is not a root is never governed by it, so it is always `allow` |
| `stale[]` | Rules that reach no operation: `{ kind: 'rest', method, path, label, shadowedBy? }` (`shadowedBy: { path, label }` names the earlier rule whose matcher takes this one's pattern, so it never applies) or `{ kind: 'graphql', type, field, label }`, `path` as the rules file spells it |
| `summary` | Counts: `total`, `covered`, `public`, `uncovered`, `refused` (uncovered with `unmatched: 'deny'`), `open` (uncovered with `unmatched: 'allow'`), `byPattern` (REST entries with `match: 'pattern'`), `stale` |

`label` is `GET /documents/:id` or `Query.me`, ready to print.

"Uncovered" is a statement about the rules file, not about the guard: under
`unmatched: allow` an uncovered operation is open, under `deny` it is refused.
`summary.refused` is the number to bring to zero before turning `deny` on, and
`summary.open` counts what `allow` leaves open (a GraphQL field that is not a
root is always one, by design).

REST operations go through the lookup `evaluateRest` uses (`findRoute`, shared
code, not a second matcher): one walk in document order, with no exact-first
step. A rule applies when its pattern is the operation or its matcher takes it,
with and without `global.basePath`, and the first such rule wins, so an earlier
`/notes/:id` takes `/notes/new` before a later `/notes/new` is reached. `HEAD`
faces its own rules and then the `GET` ones. Coverage reads an operation as an
already-matched route, and `evaluateRest` gives the same rule for a `path`, a
`route` or both (a spec runs all three). A `HEAD` operation is `public` only
when every rule it faces is, and it is `uncovered` when no `GET` rule names it,
even beside a `HEAD` rule (the guard refuses it under `deny`).

Stale rules are judged per transport, and only when the list holds an operation
of it: a GraphQL-only list does not make every REST rule stale, nor the reverse,
and an empty list judges nothing. For GraphQL a rule is judged when its type is
named by the list or is `Query`, `Mutation` or `Subscription`; a rule on a type
the list never mentions is left alone.

A rule on a deleted non-root type is never judged stale: the list never names
the type. The codegen types catch it
([`@softistx/limix-codegen`](../../limix-codegen/docs/codegen.md)).

An `operations` that is not an array, or an entry that is not an `Operation`,
throws a `TypeError` (see [troubleshooting](troubleshooting.md)).

Known limit: only a rule whose pattern does not open (no wildcard, no optional
group holding a parameter) is reported shadowed, and only in full. A rule an
earlier one takes in part (`/files/:name` before `/files/*path`) is not.

## A CI check

A script that fails the build on what the guard would refuse or a rule that
reaches nothing, and keeps spellings in line. A GraphQL field that is not a
root and has no rule is open by design (`unmatched` never governs it), so it
does not fail. List the operations from your integration; here, by hand:

```ts
// scripts/check-coverage.ts
import { compilePolicy } from '@softistx/limix'
import { loadRules } from '@softistx/limix/bun'
import { coverage, type Operation } from '@softistx/limix/coverage'

// Your list: an integration builds it; `rulesPathOf` converts OpenAPI paths.
const operations: Operation[] = [
  { kind: 'rest', method: 'GET', path: '/documents/:id' },
  { kind: 'graphql', type: 'Query', field: 'me', root: true },
]

const policy = compilePolicy(await loadRules('rules.yaml'))
const report = coverage(policy, operations)

// A REST operation or a root field no rule names; non-root fields are open by design.
const uncovered = report.operations.filter(
  (entry) =>
    entry.status === 'uncovered' &&
    (entry.operation.kind === 'rest' || entry.operation.root),
)
const spelled = report.operations.filter((entry) => entry.match === 'pattern')

for (const entry of uncovered) console.error(`uncovered (${entry.unmatched}): ${entry.label}`)
for (const entry of spelled) console.error(`spelled differently from its rule: ${entry.label}`)
for (const rule of report.stale) console.error(`stale: ${rule.label}`)
for (const rule of report.stale) {
  if (rule.kind === 'rest' && rule.shadowedBy) {
    console.error(`shadowed: ${rule.label} by ${rule.shadowedBy.label}`)
  }
}

console.log(report.summary)
if (uncovered.length + spelled.length + report.stale.length > 0) process.exit(1)
```

`summary.refused` is the part of `uncovered` the guard refuses under `deny`; the
filter above also catches the roots `allow` leaves open, which is what you want
before turning `deny` on. Get it to zero, then set `global.unmatched: deny`; the
check keeps it there.

Or as a test, which keeps the file exhaustive. `rules` is a `Rules` value (what
`loadRules`, `parseRules` or `definePolicy` returns), and `operations` is the
list your integration builds:

```ts
import { expect, test } from 'bun:test'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { coverage, type Operation } from '@softistx/limix/coverage'

const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/documents/:id': { GET: { authenticated: true } } },
})
const operations: Operation[] = [
  { kind: 'rest', method: 'GET', path: '/documents/:id' },
]

test('the rules name every operation and nothing else', () => {
  const report = coverage(compilePolicy(rules), operations)
  expect(report.operations.filter((entry) => entry.status === 'uncovered')).toEqual([])
  expect(report.operations.filter((entry) => entry.match === 'pattern')).toEqual([])
  expect(report.stale).toEqual([])
})
```

## In a browser

The same function in a rules editor, with no Node. `rules` is a `Rules` value,
for example the document the editor holds after `parseRules`, and `operations`
the list your integration built (here from a hand-written array):

```ts
import { compilePolicy, parseRules } from '@softistx/limix'
import { coverage, type Operation } from '@softistx/limix/coverage'

const rules = parseRules(JSON.parse(editorText)) // editorText: yours
const operations: Operation[] = [
  { kind: 'rest', method: 'GET', path: '/documents/:id' },
]

const { summary } = coverage(compilePolicy(rules), operations)
```
