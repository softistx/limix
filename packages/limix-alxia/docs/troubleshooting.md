# Troubleshooting `@softistx/limix-alxia`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies. `limixGuard()` and
`limixGraphql()` share the option checks: the message starts with the one you
called.

- [Setup](#setup): thrown when you build the guard
- [Checks](#checks): thrown by `checkRoutes` or while answering
- [Refusals](#refusals): an HTTP answer you did not expect

## Setup

### `<limixGuard() | limixGraphql()>: pass the options`

**When:** calling either with no argument, or `null`.
**Why:** the options object is required; the function has nothing to read.
**Fix:**

```ts
limixGuard({ policy, claims, app })
```

### `<limixGuard() | limixGraphql()>: pass `policy`, a compiled policy or a policy source`

**When:** `policy` is missing or not an object.
**Why:** the guard reads the rules from it on every request.
**Fix:**

```ts
import { compilePolicy } from '@softistx/limix'
limixGuard({ policy: compilePolicy(definition), claims, app })
```

### `<limixGuard() | limixGraphql()>: `policy` is neither a compiled policy (compilePolicy(...)) nor a policy source`

**When:** `policy` is an object that is not the result of `compilePolicy`, for
instance a raw document from `definePolicy` or `loadRules`.
**Why:** the guard needs the compiled form, or a source (`mutableSource`, the
remote client).
**Fix:**

```ts
policy: compilePolicy(definePolicy({ limix: 1, global: { unmatched: 'deny' } }))
```

### `<limixGuard() | limixGraphql()>: pass `claims`, a function of the context returning the caller's claims`

**When:** `claims` is missing or not a function.
**Why:** the guard cannot tell who is calling.
**Fix:**

```ts
claims: (ctx: { request: Request }) => ({ authenticated: ctx.request.headers.has('authorization') })
```

### `<limixGuard() | limixGraphql()>: pass `app`, the alxia app (or group) the guard is used on`

**When:** `app` is missing, or has no `routes` array.
**Why:** the guard checks the rules against the routes the app declares, so it
needs the app (or the group) it is used on.
**Fix:**

```ts
const app = alxia()
app.use(limixGuard({ policy, claims, app }))
```

### `<limixGuard() | limixGraphql()>: `mapRefusal` is a function`

**When:** `mapRefusal` is given and is not a function.
**Why:** it is called with each refusal.
**Fix:**

```ts
mapRefusal: (refusal) => (refusal.status === 401 ? { code: 'app.sign-in' } : undefined)
```

### `<limixGuard() | limixGraphql()>: the rules use relations; pass `relations`, a RelationChecker (janusRelations() from @softistx/limix-janus) or a function of the context returning one`

**When:** a static policy has a rule with `relations` and the options have no
`relations`.
**Why:** the first request that reached such a rule would fail, so setup fails
instead. A policy that comes from a source cannot be checked this early: see
the `no-relation-checker` entry under Refusals.
**Fix:**

```ts
import { janusRelations } from '@softistx/limix-janus'
limixGuard({ policy, claims, app, relations: janusRelations(/* ... */) })
```

### `limixGuard(): this app already has a limix guard; one rule set guards one service. Put the guard on a group to keep it to part of the routes`

**When:** a second `limixGuard` is given the same `app`.
**Why:** one app has one rule set. Two guards would judge every request twice.
**Fix:** give the second guard a group, and the group as its `app`:

```ts
app.group('/admin', (admin) => {
  admin.use(limixGuard({ policy: adminRules, claims, app: admin }))
  return admin.get('/stats', handler)
})
```

### `<limixGuard() | limixGraphql()>: the policy does not fit:` `- <where>: the relation rung's code "<code>" is outside `auth.errors.`, which an alxia host reads its refusals by (...)`

**When:** a static policy has a relation rung (REST or GraphQL) with a `code`
outside `auth.errors.`.
**Why:** `@softistx/alxia-access`'s `refusalOf` reads only `auth.errors.` and
`tenancy.errors.`, so a host would not recognise the refusal.
**Fix:** rename the code in the rules file, or drop `code` to take the default:

```yaml
relations:
  - require: [[{ relation: viewer, type: note, from: param.id }]]
    code: auth.errors.not-a-viewer
```

A policy from a source is not thrown on: it answers
the `policy-mismatch` entry under Refusals.

## Checks

### `checkRoutes(): the policy does not fit the app:` `- <where>: ...`

**When:** `checkRoutes(policy, app)`. Each line is one problem:

- `<METHOD> <pattern>: no route of the app takes this rule, so the routes it was written for are left to `unmatched``: a typo in the rule, or a route that was removed.
- `<where>: the relation rung's code "<code>" is outside `auth.errors.` ...`: as above.

**Why:** the rule judges nothing, or a refusal would not be read.
**Fix:** correct the pattern (`/files/*path`, `/notes/:id`) or the route, then
run the check again. Call it after the routes are declared.

```ts
checkRoutes(policy, app)
```

### `limix-alxia: a refusal's status is an HTTP error status (400 to 599), not <status>`

**When:** answering a request whose refusal, or the `status` your `mapRefusal`
returned, is not an integer from 400 to 599.
**Why:** a refusal is an error answer.
**Fix:**

```ts
mapRefusal: (refusal) => ({ status: refusal.status === 401 ? 403 : refusal.status })
```

### `limix-alxia: the policy does not fit the app, every request is refused with 503:` `- <problem>`

**When:** logged once, with `console.error`, when a policy is first looked at
and does not fit the app's routes. Every request is then refused with
the `policy-mismatch` entry under Refusals.
**Why:** the lines are the problems `checkRoutes` finds, plus this one:
`<METHOD> <pattern>: only routes declared before the guard take this rule, and they never run it; declare them after `use(limixGuard(...))``.
**Fix:** correct the rules or the routes; a source holding a fitting policy
swapped in clears it.

## Refusals

### `503 { "code": "limix.errors.unavailable", "params": { "reason": "no-policy" } }`

**When:** a request reaches a route while the policy source holds no policy
(not loaded yet, or `swap(null)`).
**Why:** the guard fails closed. The claims are not read, `retry-after: 5` is
set, and `onUnavailable` is called once for the outage.
**Fix:** give the source a policy before the first request, and watch
`onUnavailable`:

```ts
const source = mutableSource()
source.swap(policy)
```

### `503 { "code": "limix.errors.unavailable", "params": { "reason": "policy-mismatch" } }`

**When:** the held policy does not fit the app's routes. It is decided once per
policy, on the first request.
**Why:** one of: a relation rung's `code` outside `auth.errors.`; a REST rule
that no route takes; a REST rule only routes declared before the guard take (they
never run it, so they would be open). The log line above lists which.
**Fix:** run `checkRoutes(policy, app)` in a spec to find the rule, and declare
every route after `app.use(limixGuard(...))`.

### `503 { "code": "limix.errors.unavailable", "params": { "reason": "no-relation-checker" } }`

**When:** a policy from a source holds a rule with `relations` and the options
have no `relations`.
**Why:** the rule cannot be judged. A static policy fails at setup instead.
**Fix:**

```ts
limixGuard({ policy: source, claims, app, relations: janusRelations(/* ... */) })
```

### GraphQL answered by the REST guard

**When:** `POST /graphql` answers 401, 403 or 404 with a REST refusal, though
the field rules would allow the operation, or every GraphQL request is refused
under `unmatched: deny`.
**Why:** `limixGraphql` recorded its endpoint against the options object it was
given, and `limixGuard` leaves that endpoint alone only for that very object. A
copy (`{ ...limix }`, or two literals) is a different guard's.
**Fix:** one object, given to both:

```ts
const limix = { policy, claims, app }
app.use(limixGuard(limix))
limixGraphql(app, { schema, limix })
```

### A public route needs a token: bearer has no optional mode

**When:** a route the rules mark `public: true` answers 401 to a request with no
token.
**Why:** the guard is not what refuses. The bearer layer before it has no
optional mode: it refuses a missing token before the guard runs, so the rule
never gets a say.
**Fix:** keep the public routes out of the bearer layer's reach (a group of
their own, or a layer of your own that lets a missing token through as an
anonymous caller), and let `claims` return `{ authenticated: false }` for it:

```ts
claims: (ctx: { user?: { id: string } }) =>
  ctx.user ? { authenticated: true, subject: { type: 'user', id: ctx.user.id } } : { authenticated: false }
```
