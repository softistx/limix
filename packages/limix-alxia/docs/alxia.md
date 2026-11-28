# The alxia guard

How to put a rules file in front of the routes of an alxia app: `limixGuard`,
the refusals it answers, and the helpers that keep the rules and the routes in
agreement. For the rules themselves, see the
[`@softistx/limix` docs](https://github.com/softistx/limix/blob/develop/packages/limix/docs/README.md).

## The smallest guard

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard } from '@softistx/limix-alxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/me': { GET: { authenticated: true } } },
}))

const app = alxia()
app.use(limixGuard({
  policy,
  app,
  claims: (ctx: { request: Request }) => ({
    authenticated: ctx.request.headers.has('authorization'),
  }),
}))
app.get('/me', ({ reply }) => reply(200, { me: true }))
```

`GET /me` with no `authorization` header answers
`401 { "code": "auth.errors.unauthenticated" }`.

## Options

```ts
interface LimixAlxiaOptions<Ctx extends object = Empty> {
  policy: CompiledPolicy | PolicySource
  claims: (ctx: Ctx) => Claims | Promise<Claims>
  relations?: RelationChecker | ((ctx: Ctx) => RelationChecker)
  app: RoutesOf // { routes, sockets? }: the app or group
  mapRefusal?: (refusal: Refusal, ctx: Ctx) => RefusalAnswer | Response | undefined
  onUnavailable?: () => void
  onMismatch?: (problems: readonly string[]) => void
}
function limixGuard<Ctx extends object = Empty>(options: LimixAlxiaOptions<Ctx>): Middleware
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `policy` | `CompiledPolicy \| PolicySource` | required | The rules. A source (`mutableSource`, the remote client) may hold none yet: every request is then refused 503 |
| `claims` | `(ctx) => Claims \| Promise<Claims>` | required | Who is calling, read once per request that reaches a route |
| `relations` | `RelationChecker \| (ctx) => RelationChecker` | none | The relations port; a function is called once per request, and only when the held rules use relations |
| `app` | `{ routes, sockets? }` | required | The app (or group) the guard is used on, so its routes are checked against the rules |
| `mapRefusal` | `(refusal, ctx) => RefusalAnswer \| Response \| undefined` | none | Rewords a refusal, or answers it yourself |
| `onUnavailable` | `() => void` | none | Called once each time a source stops holding a fitting policy. With `limixGraphql` on the same options, REST and GraphQL report one outage once; each later outage is reported again, whichever side sees it |
| `onMismatch` | `(problems: readonly string[]) => void` | `console.error` | Called once per policy that does not fit the app, with each cause; when absent, one `console.error` says it |

`Ctx` is the context your `claims` function reads. Annotate its parameter and
alxia refuses, at the type level, to give the guard to a route chain that does
not provide it.

## Middleware order

The guard reads who is calling, so everything that decides who is calling
comes before it, and the routes come after.

```ts
import { alxia, defineMiddleware } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard } from '@softistx/limix-alxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/reports': { GET: { roles: [['analyst']] } } },
}))

// 1. Preflights are answered before anything judges them (use your CORS package).
const cors = defineMiddleware(async (ctx, next) =>
  ctx.request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : next())

// 2. Who is calling.
const authenticate = defineMiddleware(async (ctx, next) =>
  next({ roles: ctx.request.headers.get('x-roles')?.split(',') ?? [] }))

// 3. The tenancy derive: the scope the claims read.
const tenancy = defineMiddleware(async (_ctx, next) => next({ scope: { tenant: 'acme' } }))

const app = alxia().use(cors).use(authenticate).use(tenancy)

// 4. The guard.
app.use(limixGuard({
  policy,
  app,
  claims: (ctx: { roles: string[]; scope: { tenant: string } }) => ({
    authenticated: true,
    roles: ctx.scope.tenant === 'acme' ? ctx.roles : [],
  }),
}))

// 5. Routes.
app.get('/reports', ({ reply }) => reply(200, []))
```

A route declared before `app.use(limixGuard(...))` never runs the guard and
would stay open, so `limixGuard()` throws when the app (or group) it is given
already holds one, naming each (`limixGuard(): routes declared before the guard
never run it and stay open: GET /health`). Declare the guard first, then the
routes; a health route gets a `public: true` rule. Only a `limixGraphql`
endpoint may come first: its fields carry their own guard. See
[troubleshooting](troubleshooting.md).

There is no built-in OPTIONS handler in alxia: a CORS layer answers preflights.
Put it first, or a preflight reaching a route is judged by that route's rule
and refused.

## Groups

`app` is the app or the group the guard is used on. One app takes one guard:
a second `limixGuard` on the same `app` throws. A group takes its own, which is
how part of the routes get a rule set of their own.

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard } from '@softistx/limix-alxia'

const adminRules = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/admin/stats': { GET: { roles: [['admin']] } } },
}))

const app = alxia()
app.get('/health', ({ reply }) => reply(200, { ok: true }))
app.group('/admin', (admin) => {
  admin.use(limixGuard({ policy: adminRules, app: admin, claims: () => ({ authenticated: true, roles: ['admin'] }) }))
  return admin.get('/stats', ({ reply }) => reply(200, {}))
})
```

A request is judged by the full declared path, prefix included (`/admin/stats`).

### Several rules files on one app

The innermost guard that owns a route judges it alone. An outer guard leaves a
route to another guard only when the guard right after it in the route's chain
(no hook of any kind between them) is a `limixGuard` that the app it was given
declares this route behind: the same route at the same exact path. Otherwise the
outer guard judges it as well, and both guards must allow it (closed). So a
missing, misplaced or misconfigured inner guard never opens a route. A
`limixGraphql` endpoint is left by every guard to its own field rules (a plugin's
endpoint mounted under a prefix only when the host has a `limixGuard`, see below).

```ts
const app = alxia()
const outer = { policy: outerRules, claims, app }
app.use(limixGuard(outer))
app.get('/health', ({ reply }) => reply(200, { ok: true }))
limixGraphql(app, { schema, limix: outer })

app.group('/console', (group) => {
  const consoleGuard = { policy: consoleRules, claims, app: group }
  group.use(limixGuard(consoleGuard)) // first in the group
  group.get('/users', ({ reply }) => reply(200, []))
  return limixGraphql(group, { schema: consoleSchema, limix: consoleGuard, path: '/graphql' })
})
```

The outer file names no console route; the console file names the full paths
(`/console/users`) and the fields of its own schema. `alxiaOperations(app)` leaves
out the routes the group's guard judges: cover them with `alxiaOperations(group)`
against the console rules. An outer rule left for such a route is not taken:
`checkRoutes` reports it and the guard answers 503 `policy-mismatch`; move the rule
to the group's file.

- Order matters: `limixGuard` goes last among the app's own middlewares and the
  group's guard first in the group. A middleware between the two guards (a
  cache that answers from a store, say) answers before the group's guard, so the
  outer guard does not leave the route: both judge it (closed), and
  `checkGuard(guard, app)` reports it (`a hook stands between this guard and the
  group's guard`). A `derive` or `decorate` declared after `limixGuard` on the
  outer app is such a hook too: every group then has both guards judge.
  `checkGuard` reports it when the app starts through `listen`; under a bare
  `fetch` it shows as a 403 from the outer rules.
- A group without its own guard is judged by the outer rules.
- A guard used with a path (`group.use('/users', guard)`): alxia keeps the hook
  on the routes the path reaches, with no `when`, so the group's guard takes those
  routes (and answers 503 if it does not fit the group's other routes); the other
  routes never run it and the outer rules judge them.
- A guarded plugin mounted under a prefix it does not know (inside a prefixed
  group, under a host prefix, or twice) holds its routes under its own paths, so
  its guard cannot find the copy the host router matched. Its `limixGraphql`
  endpoint is still left to the field guard when the host has a `limixGuard`: the
  host guard tells the plugin guard which definition it matched, and the plugin
  guard accepts it only for a mounted copy of its own endpoint (same handler and
  schema, same guard hook, its own path under a valid prefix, exactly the same
  method). A host without a guard places nothing, so the endpoint is refused
  (403, closed). The plugin's REST routes are still judged by both guards: write
  their rules with `global.basePath`, mount the plugin at the top level with a
  prefix of its own (`alxia({ prefix: '/console' })`), or use a group.
- A plugin without a prefix gives its chain, its guard included, to the host
  routes declared after it, so that guard judges them too. They are never left
  to it: the outer guard judges them, whatever handler or options they share
  (the route must be the plugin's own, mounted copy; a host route never takes
  its place).
- Under a host prefix, rules for a plugin's own REST routes use `global.basePath`.

### Forks

`app.fork()` makes a new app with its own routes. A guard belongs to the app it
was given: each fork carries its own,
`base.fork().use(limixGuard({ ..., app: fork }))`. A guard on `base` still runs
for the routes declared on a fork, but those routes are not in `base.routes`:
they are judged by rules never checked against them. The guard answers 503
`policy-mismatch` only when a rule names a route that no route of `base` takes
(a rule written for a fork-only route). The base guard still judges the routes of a fork. See
[troubleshooting](troubleshooting.md#a-fork-answers-503-policy-mismatch).

## Claims and tenants

`claims(ctx)` is the only way who-is-calling and which-tenant reach the rules.
There is no `tenant` option: one guard holds one rule set per service, and a
tenant's scope is read from the context a tenancy layer filled in. The `when`
conditions of a rule receive that context as `info`.

A refusal-shaped error thrown while the claims resolve (an error with a string
`code` under `auth.errors.` or `tenancy.errors.` and a numeric `status`, such as
a `TenancyError` from an unknown tenant) is answered as a refusal with its own
code and status. Any other error propagates to alxia's error handling.

```ts
import { alxia, defineMiddleware } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard } from '@softistx/limix-alxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/t/:tenant/reports': { GET: { roles: [['analyst']] } } },
}))

// What a tenancy layer gives: a lazy scope that throws a refusal for an unknown tenant.
const tenancy = defineMiddleware(async (ctx, next) => {
  const tenant = ctx.pathParams['tenant'] ?? ''
  return next({
    scope: () => {
      if (tenant === 'ghost') {
        throw Object.assign(new Error('unknown tenant'), {
          code: 'tenancy.errors.unknown-tenant',
          status: 404,
          params: { tenant },
        })
      }
      return { tenant }
    },
  })
})

const app = alxia().use(tenancy)
app.use(limixGuard({
  policy,
  app,
  claims: (ctx: { scope: () => { tenant: string } }) => ({
    authenticated: true,
    roles: ctx.scope().tenant === 'acme' ? ['analyst'] : [],
  }),
}))
app.get('/t/:tenant/reports', ({ reply }) => reply(200, []))
// GET /t/ghost/reports -> 404 { "code": "tenancy.errors.unknown-tenant", "params": { "tenant": "ghost" } }
```

The package takes no `@softistx/alxia-access` or `@softistx/alxia-tenancy`
dependency: it reads the shape of their errors.

## Relations

`relations` is a `RelationChecker`, or a function of the context returning one.
A function is called once per request, and only when the held rules use
relations. A static policy that uses relations with no `relations` throws at
`limixGuard()`; a source's policy cannot be known then and is refused 503
`no-relation-checker` instead. See the
[relations guide](https://github.com/softistx/limix/blob/develop/packages/limix/docs/relations.md).

```ts
import { limixGuard } from '@softistx/limix-alxia'
import { alxia } from '@softistx/alxia'
import type { compilePolicy, RelationChecker } from '@softistx/limix'

declare const policy: ReturnType<typeof compilePolicy>
declare function checkerFor(request: Request): RelationChecker

const app = alxia()
app.use(limixGuard({
  policy,
  app,
  claims: (ctx: { request: Request }) => ({ authenticated: ctx.request.headers.has('authorization') }),
  relations: (ctx) => checkerFor(ctx.request), // once per request
}))
```

## Refusals

A refusal is answered in the format the app answers its errors in
(`alxia({ errors })`).

| `errors` | Body | Content type |
| --- | --- | --- |
| `'json'` | `{ "code": "auth.errors.forbidden" }`, plus `"params"` when there are some | `application/json` |
| `'problem'` | a problem: `status`, `detail` the code, and `code` and `params` as extensions | `application/problem+json` |

The status is the rule's: 401 unauthenticated, 403 forbidden, 404 not found
when a rung hides the resource. Codes sit under `auth.errors.`, the prefix
`@softistx/alxia-access`'s `refusalOf` reads, so a host that maps refusals with
it gets these as it gets its own. A rule whose relation rung sets a `code`
outside `auth.errors.` is refused at setup (see the checks below).

A 503 (no policy, a policy that does not fit) carries `retry-after: 5`:

```json
{ "code": "limix.errors.unavailable", "params": { "reason": "no-policy" } }
```

### `mapRefusal`

Reword a refusal, or answer it yourself. The `Refusal` has `code`, `status`
and `params`; return `undefined` to keep it as is.

```ts
import { limixGuard } from '@softistx/limix-alxia'
import { alxia } from '@softistx/alxia'
import { compilePolicy } from '@softistx/limix'

declare const policy: ReturnType<typeof compilePolicy>
const app = alxia()

app.use(limixGuard({
  policy,
  app,
  claims: (ctx: { request: Request }) => ({ authenticated: ctx.request.headers.has('authorization') }),
  mapRefusal: (refusal, ctx) =>
    refusal.status === 401
      ? { code: 'app.sign-in', status: 401, detail: `sign in to ${ctx.request.url}` }
      : undefined,
}))
```

```ts
interface Refusal { readonly code: string; readonly status: number; readonly params: Readonly<Record<string, unknown>> }
interface RefusalAnswer { code?: string; status?: ErrorStatus; detail?: string } // ErrorStatus: alxia's 4xx and 5xx
```

`import type { ErrorStatus } from '@softistx/limix-alxia'` types a `mapRefusal` answer's `status` (alxia's 4xx and 5xx statuses).

`detail` is the problem's `detail`, or the JSON body's `message`. Returning a
`Response` replaces the answer entirely. `status` is typed as alxia's error
statuses (a `302` is a compile error); a value outside 400 to 599 that gets
past the types still throws a `TypeError` when the request is answered.

## HTTP methods

| Request | Judged as |
| --- | --- |
| `HEAD` | By its `HEAD` rules, then the `GET` ones: both must allow |
| `OPTIONS` | By its own rule like any method; put a CORS layer first to answer preflights |
| `ALL` routes (`app.all`) | By the request's method: a `GET` rule does not cover a `POST` to the same route. The route also takes methods such as `PROPFIND` that `alxiaOperations` cannot list, so coverage reports them under `unmatched` |
| `QUERY` | A method like another |
| WebSocket upgrade | As a `GET` on the socket's path, refused before the upgrade. A socket you declare at a `limixGraphql` path is judged by the REST rules like any other: an upgrade is matched to its socket first, as alxia does |

A plain `GET` on a socket path is answered 426 by alxia before the guard runs.

## The path a request is judged by

The rules are matched against the path as the handler sees it, not against the
route pattern: the guard rebuilds the declared route (prefix included) with the
decoded path parameters put back, then core walks the rules in document order.
So a literal `/users/me` rule written before `/users/:id` applies to
`GET /users/me`, `/users/me/` and `/users/%6De` alike. A `/` or `%` inside a
parameter's value stays inside its segment (`/users/a%2Fb` is one segment); a
wildcard (`*`) keeps its slashes, and a `%` inside its value is encoded.

Three limits:

- A wildcard route with an empty tail (`/files`, `/files/`, `/users/me` on
  `/users/:id/*`, `/api` on a prefixed `/*`) has no segment to rebuild. The guard
  walks the rules in document order and takes the first that matches the path
  without the tail, else the first ending in a wildcard (`*path`, a bare `*`, or
  inside `{...}`) that matches it with a segment added: alxia's optional tail meets a
  `*path` rule. That rule applies; with none, the request falls to `unmatched`.
- Literal segments of the route are judged in the form a URL carries them
  (`/users/%C3%A9t%C3%A9`), while parameters are judged decoded (`été`): a rule
  written `/users/%C3%A9t%C3%A9` never applies to a parameter route. Write such a
  rule decoded, or declare the route as a literal.
- Core matches rules case-insensitively, so `/Users/ME` meets `/users/me`.

## Unmatched requests

A request that reaches no route (unknown path, a method the path does not take)
is left to alxia's 404 or 405: the claims are not read and no rule judges it.
`unmatched: deny` in the rules governs a route no rule names, not a path with no
route.

## Request bodies

A rule's relation term may read `json.` from the request body. When one does
(its `readsBody` is set on the compiled rule), the guard reads the body from a
clone, for a JSON `content-type` only (any type that mentions `json`, as alxia
reads one: `application/json`, `text/json`, `application/vnd.api+json`); the
handler still reads its own. A body over the route's `bodyLimit` stays 413, and
text that is not JSON leaves the term with nothing to read.

Two limits. A custom `app.parser` is not seen by body rules: the guard parses
the body as plain JSON. And a rule's `when` condition never sees `request.json`:
core reads the body only for relation terms (`json.` in a `from`).

## Sources, outages and `policy-mismatch`

A `PolicySource` may hold no policy, or have one swapped in. The guard fails
closed and reads the source once per request.

| Situation | Answer |
| --- | --- |
| The source holds none | 503 `limix.errors.unavailable`, `params.reason: 'no-policy'`; claims not read |
| The held policy does not fit the app's routes | 503, `params.reason: 'policy-mismatch'` |
| A source's rules use relations and there is no `relations` | 503, `params.reason: 'no-relation-checker'` |

`onUnavailable` runs once per outage and is re-armed when a fitting policy is
swapped in. With `limixGraphql` on the same options object, the REST guard and
the GraphQL field guard share one outage: a source swapped to `null` reports
once, whichever request sees it first. A report of the same outage from the
other side is dropped only while the first stands; a different policy held, or a
fitting one seen by the REST guard, ends it, so the next outage is reported
again, with or without the REST guard. `policy-mismatch` is decided once per policy, on the first request
(routes are declared after `use()`), and has these causes:

- a relation rung's `code` outside `auth.errors.`;
- a REST rule that no route of the app takes (a typo, a removed route).

The check also looks at every route and socket of `app`: one whose chain does
not hold this guard (declared before its `use()`, or outside the scope it was
used in, such as a guard used in a group but given the parent app) is named in
the problems, and the guarded routes answer 503 `policy-mismatch`. The route
that never runs the guard cannot be refused by it: it stays as open as it was,
which is why the guard also throws when it is built with routes already declared.

A route declared between `limixGuard()` and its `use()` is found by `checkGuard`:
the guard registers it on the app's `onStart`, so an app started through `listen`
stops at once (alxia only logs what an `onStart` hook throws, so the hook stops
the server and rethrows) with
`checkGuard(): routes that never run the guard and stay open: ...`. An app never
started through `listen` keeps the request-time 503; pin it in a spec:

```ts
import { checkGuard } from '@softistx/limix-alxia'

const guard = limixGuard({ policy, claims, app })
app.use(guard)
app.get('/health', handler)
expect(checkGuard(guard, app)).toEqual([]) // issues when a route of `app` does not run `guard`
```

```ts
function checkGuard(guard: unknown, app: RoutesOf): readonly RouteIssue[]
```

It returns issues, empty when fine, and never throws; only the guard's own
`onStart` hook throws (a `TypeError` with the messages below). See
[`RouteIssue`](#routeissue).

A policy that does not fit calls `onMismatch(problems)` once, so the 503 is
explained once; without `onMismatch` it logs one `console.error` listing each
cause. A static policy's rung codes throw at `limixGuard()`;
its routes are checked on the first request.

### `checkRoutes`

The same checks, run on your terms, in a spec or at boot once the routes are
declared. It returns the stale-rule and rung-code problems as
[`RouteIssue`](#routeissue)s, empty when the policy fits, and never throws.

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { checkRoutes } from '@softistx/limix-alxia'

declare const app: ReturnType<typeof alxia>
const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/health': { GET: { public: true } } },
}))

checkRoutes(policy, app) // one `unmatched-rule` issue when no route of `app` takes `GET /health`
```

```ts
function checkRoutes(policy: CompiledPolicy, app: RoutesOf): readonly RouteIssue[]
```

### `RouteIssue`

What `checkRoutes` and `checkGuard` return, one per problem:

```ts
type RouteIssueKind = 'rung-code' | 'unmatched-rule' | 'open-route' | 'separated-guards'

interface RouteIssue {
  readonly kind: RouteIssueKind
  readonly path: string // the rule key or route label: `GET /files/*path`, `Query.me`, `GET /admin`
  readonly message: string
  readonly fix: string
}
```

| `kind` | From | Meaning |
| --- | --- | --- |
| `rung-code` | `checkRoutes` | A relation rung's `code` is outside `auth.errors.` |
| `unmatched-rule` | `checkRoutes` | A REST rule no route of the app takes (a rule for method `*`, `* /admin/*`, is taken when a route of any method does) |
| `open-route` | `checkGuard` | A route or socket that never runs the guard |
| `separated-guards` | `checkGuard` | A hook stands between a group's guard and the app's |

`path` is the rule key or route label, unlike `NeedsIssue.path` of limix-graxia, which is a place in the rules file. The list grows with new checks: switch on `kind` with a default branch.

## GraphQL

`limixGraphql` is alxia-graphql's `graphql(app, options)` with the rules in
front of every field: the schema goes through limix-graxia's `guardSchema`
and its plugin. It lives in `@softistx/limix-alxia/graphql` and needs the
optional peers (see the [README](../README.md#install)). Pass it, as `limix`,
**the same options object** `limixGuard` got.

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard, type LimixAlxiaOptions } from '@softistx/limix-alxia'
import { limixGraphql } from '@softistx/limix-alxia/graphql'
import { buildSchema } from 'graphql'

const app = alxia()
const limix: LimixAlxiaOptions<{ request: Request }> = {
  policy: compilePolicy(definePolicy({
    limix: 1,
    global: { unmatched: 'deny' },
    rest: { '/health': { GET: { public: true } } },
    graphql: { Query: { me: { authenticated: true } } },
  })),
  claims: (ctx) => ({ authenticated: ctx.request.headers.has('authorization') }),
  app,
}

app.use(limixGuard(limix))
app.get('/health', ({ reply }) => reply(200, { ok: true }))
limixGraphql(app, { schema: buildSchema('type Query { me: String }'), limix })
```

Every guard of the app leaves the endpoint to the field rules: `Query.me` judges the request,
not a REST rule for `POST /graphql`. `limixGraphql` takes everything
`graphql()` takes, plus:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `limix` | `LimixAlxiaOptions` | required | The guard's options object, the same one |
| `mapRefusal` | limix-graxia's `MapRefusal` | none | Rewords a refused field's GraphQL error; the guard's REST `mapRefusal` is not used here |
| `nonNull` | `'refuse' \| 'allow'` | `'refuse'` | A named field that is non-null would turn a refusal into a null parent; `'refuse'` rejects it at setup |

The extras are exported as `LimixGraphqlExtras<Ctx extends object = Empty>` from
`@softistx/limix-alxia/graphql`; `limixGraphql`'s own options type (the extras
joined to `graphql()`'s, which has five generics) is not exported, so a new
`graphql()` generic is no break here. Type a shared object as the extras:

```ts
import type { LimixGraphqlExtras } from '@softistx/limix-alxia/graphql'

const extras: LimixGraphqlExtras = { limix }
```

`Ctx` is the app's context (`Alxia<Ctx>`), not the request's; it defaults to an
empty one. Name it when the app decorates its context:
`LimixGraphqlExtras<{ db: Db }>`.

A refused top-level field answers with the HTTP status of its refusal; a refused
nested field answers 200 with the error in `errors`. Claims are read once per
operation. See the [limix-graxia guide](https://github.com/softistx/limix/blob/develop/packages/limix-graxia/docs/graphql.md).

The endpoint is known by its handler on the app the guard sits on: whatever
mounts it there (`limixGraphql` on the app, on a group, or on a plugin app that
the guarded app mounts, with or without a prefix) is left to the field guard,
and a REST route of your own at `POST /graphql`, even one sharing the options,
is judged by the REST rules. The REST guard and the GraphQL field guard also
share one outage state per options object (`onUnavailable` runs once). If the
guard cannot find the definition of the matched route in `app`, it judges the
request (fail closed). Pass `limixGraphql` the guarded app, or a group or plugin
mounted on it.
See [GraphQL answered by the REST guard](troubleshooting.md#graphql-answered-by-the-rest-guard).

## Coverage

When routes overlap (`/notes/:id` declared before `/notes/new`), coverage
reports the rule the guard applies, and lists the one it shadows as stale with
`shadowedBy`.

`alxiaOperations(app)` lists the routes in the shape `coverage()` takes: each
route in the rules file's pattern spelling (`/files/*` becomes `/files/*path`),
`all` expanded to the methods it takes, each socket as the `GET` that upgrades
it, and the `HEAD` every `GET` answers. The endpoints `limixGraphql` declared
are left out, and so are the routes a group's or plugin's own guard judges
(list them with `alxiaOperations(group)`); `graphqlOperations` lists the
endpoint fields. Combine both to cover the
whole service:

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { coverage } from '@softistx/limix/coverage'
import { alxiaOperations } from '@softistx/limix-alxia'
import { graphqlOperations } from '@softistx/limix-graxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/health': { GET: { public: true } } },
  graphql: { Query: { me: { authenticated: true } } },
}))

declare const app: ReturnType<typeof alxia> // routes and limixGraphql already declared
const sdl = 'type Query { me: String notes: [String] }'

const report = coverage(policy, [...alxiaOperations(app), ...graphqlOperations(sdl)])
if (report.summary.uncovered > 0) {
  throw new Error(`routes or fields no rule names: ${report.summary.uncovered}`)
}
```

```ts
function alxiaOperations(app: RoutesOf): RestOperation[]
```

An `all` route also takes methods such as `PROPFIND` or `PURGE` that coverage
cannot list; requests with them are judged by the rules and, with no rule for
them, fall under `unmatched`.

See the [coverage guide](https://github.com/softistx/limix/blob/develop/packages/limix/docs/coverage.md)
for the report.
