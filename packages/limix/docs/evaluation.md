# Evaluation

A compiled policy answers one question: may this caller reach this REST route
or this GraphQL field? `evaluateRest` and `evaluateField` answer it with a
`Decision`; `explain` answers it again and shows its work.

> The snippets of these guides are schematic: where one uses a name it does not
> define (`claims`, `relations`, `info`, `source`, `body`, `logger`, `myBackend`), read it as yours.

```ts
import { compilePolicy, evaluateRest, loadRules } from '@softistx/limix'

const policy = compilePolicy(await loadRules('rules.yaml'), {
  conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
})

const decision = await evaluateRest(policy, {
  method: 'PUT',
  path: '/api/documents/42',
  claims: {
    authenticated: true,
    subject: { type: 'user', id: 'u1' },
    roles: ['editor'],
    scope: 'documents:write',
  },
})

if (!decision.allow) {
  const { code, status, params } = decision.refusal
  // answer `status`, worded from `code` and `params`
}
```

## Claims

`Claims` is the caller as your integration read it from its own credential. The
evaluators never read a header or a token.

| Field | Meaning |
| --- | --- |
| `authenticated` | Whether the credential named a caller. Required |
| `subject` | `{ type, id }`, the identity relations are asked about (as in janus) |
| `roles` | What `roles` terms read. A value that is not a list holds no role |
| `permissions` | What `permissions` terms read, together with `scope` |
| `scope` | Space-separated scopes. A permission must be a token of `scope`, and also in `permissions` when that list is present; without `scope` no permission holds |
| any other key | Free; a `when` condition reads it from `claims` |

An anonymous caller is `{ authenticated: false }`.

## Decision and refusal

```ts
type Decision =
  | { allow: true }
  | { allow: false; refusal: LimixRefusal }
```

A `LimixRefusal` is a neutral object, with no HTTP framework in it:

| `code` | `status` | When |
| --- | --- | --- |
| `auth.errors.unauthenticated` | 401 | The rule is not `public` and the caller is not signed in; or an unnamed route under `unmatched: deny` for an anonymous caller |
| `auth.errors.forbidden` | 403 | `roles`, `permissions` or `when` failed; an unnamed route under `unmatched: deny` for a signed-in caller; a `FORBIDDEN` rung; a signed-in caller with no `subject` on a rule with relations (`params.reason: 'no-subject'`) |
| `auth.errors.not-found` | 404 | A relation rung failed and answers `NOT_FOUND` (the default) |
| `limix.errors.unavailable` | 503 | The source holds no policy, or the rule declares relations and no `RelationChecker` was given. `params.reason` is `no-policy` or `no-relation-checker` |

A relation rung that names a `code` answers with it, in place of
`auth.errors.not-found` or `auth.errors.forbidden`. `@softistx/alxia-access`'s
`refusalOf` reads only codes under `auth.errors.` or `tenancy.errors.`, so a
custom code must sit under `auth.errors.` for it to be read; `limix.errors.unavailable`
is not, and the alxia integration maps it to its own 503.

`LimixRefusal` extends `Error` and carries the registered symbol
`Symbol.for('limix.refusal')`. An integration that must not import the class
checks it with the guard, which also recognises a refusal from another copy of
the package:

```ts
import { isLimixRefusal } from '@softistx/limix'

function onError(error: unknown) {
  if (isLimixRefusal(error)) return { status: error.status, body: { code: error.code, ...error.params } }
  throw error
}
```

## The ladder

Each matched rule is checked cheapest first, and the first failure answers:

1. **Sign-in** (401): unless the rule is `public`, the caller must be
   authenticated.
2. **`roles`** (403), in disjunctive normal form: the outer list is OR, each
   inner list is AND. `[['admin'], ['editor', 'reviewer']]` is "admin, or
   editor and reviewer".
3. **`permissions`** (403), same nesting. A permission holds when it is in
   `claims.scope` and, when the caller carries `claims.permissions`, in that
   list too.
4. **`when`** (403): every named condition must hold. A predicate that throws,
   or answers anything but `true`, denies.
5. **`relations`** (404 or 403, as each rung says), one rung after the other.
   See [Relations](relations.md). Only this stage leaves the process, so it
   runs last.

## REST

```ts
evaluateRest(policy, {
  method: 'PUT',
  route: '/documents/:id',          // or path: '/api/documents/42'
  claims,
  request: { params: { id: '42' }, query: {}, json: body },
  relations,                        // only for rules that declare `relations`
  info,                             // handed to `when` conditions
})
```

- `route` is a route pattern your framework already matched. It is tried
  first, and may be written with or without `global.basePath`. It must be the
  spelling of the rules file (`/documents/:id`, not the framework's
  `/documents/{id}`); coverage checks that spelling (planned, see the roadmap).
  When it names no rule and `path` is given, `path` is matched before
  `global.unmatched` applies. Pass `params` yourself with `route`.
- `path` is matched against the compiled table, first pattern in document
  order; what it captures is merged under `request.params` (yours win).
- Neither given throws `evaluateRest: pass the \`route\` or the \`path\``, unless the source holds no policy: that answers 503 first.
- `HEAD` faces its own rules and then the `GET` ones: both must allow.
- A route no rule names follows `global.unmatched`: `allow` lets it through,
  `deny` answers 401 to an anonymous caller and 403 to a signed-in one.

Conditions receive `{ claims, request: { params, query, json }, info }`.

## GraphQL fields

```ts
evaluateField(policy, {
  type: 'Mutation',
  field: 'updateNote',
  claims,
  args: { id: 'n1' },
  source,                           // the parent value, for `source.` paths
  info,                             // handed to `when` conditions
  relations,
  root: true,                       // optional, see below
})
```

Call it from a resolver or a schema wrapper; wrapping a schema is the job of
`@softistx/limix-graxia` (planned, see the roadmap). Only a root field that no
rule names falls under `global.unmatched`: a field of another type with no rule
is let through, since every field of every returned type would otherwise need
a rule. `root` says whether the type is an operation root; it defaults to the
type being named `Query`, `Mutation` or `Subscription`. A schema that renames
its roots (`schema { query: RootQuery }`) makes the integration read them from
the schema and pass `root: true`, or `unmatched: deny` would not cover them. Conditions receive
`{ claims, args, source, info }`.

## Sources

An evaluator takes a compiled policy or a source:

```ts
import { mutableSource, staticSource } from '@softistx/limix'

const fixed = staticSource(policy)
const live = mutableSource()          // holds nothing yet
live.swap(policy)                     // hot swap; swap(null) withdraws it
```

`policySource({ current, subscribe })` brands your own implementation as a source.
A source that holds no policy answers every call with `limix.errors.unavailable`
(503): it fails closed. `isPolicySource` tells a source from a policy.
`outageReporter(report)` calls `report` once per withdrawal rather than once per
request, for a log line: call the function it returns with `source.current()`
before each evaluation. `OUTAGE_MESSAGE` is the line it is meant to log.

```ts
import { OUTAGE_MESSAGE, outageReporter } from '@softistx/limix'

const watch = outageReporter(() => logger.error(OUTAGE_MESSAGE))
// per request: watch(live.current())
```

Integrations should throw at setup when `policy.usesRelations` is true and no
`RelationChecker` was given, rather than answer 503 to every request that
reaches such a rule.

## Explain

`explain` runs the evaluation and returns every step. It is the same code the
evaluators run, not a second implementation, so a simulator built on it cannot
disagree with production. It does call your `RelationChecker` and your `when`
conditions, as they do.

```ts
import { explain } from '@softistx/limix'

const { decision, steps } = await explain(policy, {
  method: 'PUT',
  path: '/api/documents/42',
  claims,
  relations,
})
```

An input with a `field` is a GraphQL field, any other a REST request. `steps`
runs in order and stops at the first refusal:

| `kind` | What it records |
| --- | --- |
| `source` | The source held no policy |
| `match` | The rule that matched (`PUT /api/documents/:id`, `Mutation.updateNote`) |
| `unmatched` | No rule names the request, and what `global.unmatched` then said |
| `floor` | The sign-in check |
| `roles`, `permissions` | Each term tried (`terms`), the alternative it belongs to, whether it held |
| `when` | Each condition tried, up to the first that failed; a throw is in `note` |
| `relations` | One step per rung (`rung` from 0), each term, and whether it held; with no `RelationChecker` or no `subject` a single step with neither `rung` nor `terms` |

```ts
// steps for a caller who is not an editor
[
  { kind: 'match', label: 'PUT /api/documents/:id', passed: true },
  { kind: 'floor', label: 'a signed-in caller is required', passed: true },
  {
    kind: 'roles',
    label: 'roles, one alternative must hold',
    passed: false,
    terms: [{ label: 'editor', passed: false, alternative: 0 }],
  },
]
```
