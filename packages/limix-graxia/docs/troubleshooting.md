# Troubleshooting `@softistx/limix-graxia`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies. `guardSchema()` and
`limixGraxia()` share the option checks: the message starts with the one you
called.

## Setup

### `<guardSchema() | limixGraxia()>: pass the options`

**When:** calling either with no argument, or `null`.
**Why:** the options object is required; the function has nothing to read.
**Fix:**

```ts
guardSchema(schema, { policy, claims })
```

### `<guardSchema() | limixGraxia()>: pass `policy`, a compiled policy or a policy source`

**When:** `policy` is missing or not an object.
**Why:** the guard reads the rules from it on every call.
**Fix:**

```ts
import { compilePolicy } from '@softistx/limix'
guardSchema(schema, { policy: compilePolicy(definition), claims })
```

### `<guardSchema() | limixGraxia()>: `policy` is neither a compiled policy (compilePolicy(...)) nor a policy source`

**When:** `policy` is an object that is not the result of `compilePolicy`, for
instance a raw rules document from `definePolicy` or `loadRules`.
**Why:** the guard needs the compiled form, or a source (`mutableSource`, the
remote client).
**Fix:**

```ts
policy: compilePolicy(definePolicy({ limix: 1, global: { unmatched: 'deny' } }))
```

### `<guardSchema() | limixGraxia()>: pass `claims`, a function of the context returning the caller's claims`

**When:** `claims` is missing or not a function.
**Why:** the guard cannot tell who is calling.
**Fix:**

```ts
claims: (ctx: { request: Request }) => ({ authenticated: ctx.request.headers.has('authorization') })
```

### `<guardSchema() | limixGraxia()>: the rules use relations; pass `relations`, a RelationChecker (janusRelations() from @softistx/limix-janus) or a function of the context returning one`

**When:** a static policy has a rule with `relations` and the options have no
`relations`.
**Why:** the first request that reached such a rule would fail, so setup fails
instead.
**Fix:**

```ts
import { janusRelations } from '@softistx/limix-janus'
guardSchema(schema, { policy, claims, relations: janusRelations({ access }) })
```

### `<guardSchema() | limixGraxia()>: `nonNull` is 'refuse' or 'allow'`

**When:** `nonNull` holds another value.
**Why:** only the two modes exist.
**Fix:**

```ts
guardSchema(schema, { policy, claims, nonNull: 'allow' })
```

### `guardSchema(): this schema is already guarded`

**When:** passing the result of `guardSchema` to `guardSchema` again.
**Why:** a second wrapping would evaluate every field twice.
**Fix:** guard the original schema once, and keep the result.

```ts
const guarded = guardSchema(schema, options) // not guardSchema(guarded, ...)
```

### `guardSchema(): the policy does not fit the schema:` followed by a list

**When:** `guardSchema` with a static policy. Each line of the list is one of:

- `<Type>: the schema has no such type` — a rule names a type the schema lacks.
  Fix the type name or remove the rule.
- `<Type>: rules go on object types, this one is not` — the type is an
  interface, union, input, scalar or enum. Put the rule on the object types
  that implement it.
- `<Type>.<field>: the type has no such field` — a typo, or a field removed.
- `<Type>.<field>: is non-null, so a refusal would null its parent; make it
  nullable, or pass `nonNull: 'allow'`` — see
  [the non-null rule](graphql.md#the-non-null-rule).
- `<Type>.*: covers <Type>.<field>, which is non-null, so a refusal would null
  its parent; make it nullable, or pass `nonNull: 'allow'`` — the same, for a
  field a `Type.*` rule covers (one line for each such field). Make the field
  nullable, or pass `nonNull: 'allow'`. A field with a rule of its own is
  judged by that rule's line, not the wildcard's.
- `<Type>.<field>: a subscription starts with no `source`, so a relation
  reading `source.` fails at subscribe; read `args.``.

**Why:** the rule could never be enforced as written, so the guard refuses to
start rather than leave a field open.
**Fix:** correct the rules file (or the schema) for each line. A rules file
checked against the schema in a spec finds them before deploy:

```ts
test('the rules fit the schema', () => {
  expect(() => guardSchema(schema, { policy, claims, relations })).not.toThrow()
})
```

### `limixGraxia(): the schema was not made by guardSchema(schema, options), so its fields would be open. Pass the guarded schema to createGraxia()`

**When:** `createGraxia` starts with the plugin and the original schema.
**Why:** the plugin only reads the claims and remaps errors; the wrapping is
`guardSchema`'s.
**Fix:**

```ts
createGraxia({ schema: guardSchema(schema, options), plugins: [limixGraxia(options)] })
```

## Runtime

### `limix-graxia: `claims` must return a claims object ({ authenticated: boolean, ... })`

**When:** the first guarded field of a request; graxia masks it as an internal
error.
**Why:** `claims` returned `undefined`, `null` or a non-object, often for a
request with no credential.
**Fix:** answer an anonymous caller with `{ authenticated: false }`:

```ts
claims: async (ctx) => (await verify(ctx.request)) ?? { authenticated: false }
```

### `auth.errors.unauthenticated`, `auth.errors.forbidden`, `auth.errors.not-found`

**When:** a field's rule refuses the caller. `extensions.status` is 401, 403
and 404, and a refused top-level field also asks for that HTTP status.
**Why:** the claims do not meet the rule: not signed in, or a role, permission
or relation is missing. A root field with no rule is refused too under
`unmatched: deny`.
**Fix:** check the claims your `claims` option returns (a missing `scope`
makes every permission fail), the rule, and the
[limix evaluation guide](https://github.com/softistx/limix/blob/develop/packages/limix/docs/evaluation.md).
To show a different code, use [`mapRefusal`](graphql.md#refusals-and-their-extensions).

### `limix.errors.unavailable`

**When:** every guarded field answers a 503 with `retry-after: 5`; `params` is
`{ reason: 'no-policy' }` (the source holds no policy),
`{ reason: 'policy-mismatch' }` (it holds one that does not fit the schema, see
the next entry) or `{ reason: 'no-relation-checker' }` (a rule needs relations
and `relations` gave none, with a policy source).
**Why:** the source has not loaded rules yet, or withdrew them. The guard
fails closed.
**Fix:** load or swap a policy into the source; watch `onUnavailable` for the
moment it happened. For `no-relation-checker`, pass `relations`. See [outage](graphql.md#outage-and-onunavailable).

### `limix.errors.unavailable` with `params: { reason: 'policy-mismatch' }`

**When:** a policy source holds a policy and every guarded field answers 503;
`onUnavailable` fired.
**Why:** the held policy has a rule the schema cannot take: on a type the
schema lacks (a typo, a type removed), on an interface, union or other type
that is not an object type, on a field the type lacks, or on a Subscription
field with a relation whose `from` reads `source.` (a subscription starts with
no source). A source is never
checked when a policy is swapped in, so the guard checks each policy it holds,
once, and fails closed rather than leave that rule unenforced.
**Fix:** correct the rules file and swap it in; the next call is served. To
find the line before deploy, check the file against the schema in a spec with
a static policy, which lists each problem:

```ts
test('the rules fit the schema', () => {
  expect(() => guardSchema(schema, { policy: compiled, claims })).not.toThrow()
})
```

## Behaviours that look like bugs

### A rule on a field is not run through my `fieldResolver`

**When:** `execute({ fieldResolver })` (or a host default resolver) is set, and
a governed field that has no `resolve` of its own does not use it.
**Why:** the guard wraps the field with graphql's `defaultFieldResolver`.
**Fix:** give the field a `resolve` of its own, or leave it out of the rules.

### A raw graphql-js host reads the claims once per field

**When:** no `limixGraxia()` plugin, and `claims` (or a `relations` function)
runs for every governed field.
**Why:** only the plugin's own context is trusted to remember an answer, since a
host may reuse one context object for several callers.
**Fix:** add the plugin (one read per operation), or make `claims` cheap.

### A revoked token still receives subscription events

**When:** the caller's token is revoked or expires while a subscription is open.
**Why:** the claims are read once, when the subscription starts; only the policy
is evaluated again for each event.
**Fix:** close the stream on your side when a token is revoked (or give tokens
a short life), so the client reconnects and the claims are read again.

### `mapRefusal` gets `at.type` equal to `''`

**When:** a resolver threw a `LimixRefusal` itself and `mapRefusal` ran on it.
**Why:** the error in a result names the field and its path, not its parent
type. A refusal a guarded field made carries the real type.
**Fix:** decide on `at.field`, the refusal's code or its params.

### `canOf: claims must be an object`

**When:** calling `canOf(undefined)` or `canOf(null)`.
**Why:** an anonymous caller has claims too.
**Fix:**

```ts
canOf({ authenticated: false })
```
