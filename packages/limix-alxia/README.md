# @softistx/limix-alxia

The [alxia](https://www.npmjs.com/package/@softistx/alxia) integration of
[`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md):
a middleware that judges every request that reaches a route by a rules file,
refusals answered in the app's error format, the route list a coverage test
reads, and a GraphQL endpoint whose fields answer to the same rules.

## Install

The package is published with restricted access: installing it needs an npm
token that can read the `@softistx` scope.

```sh
bun add @softistx/limix-alxia @softistx/limix @softistx/alxia
```

`@softistx/limix`, `@softistx/alxia` (0.28.0 or later, below 1.0.0) and
`typescript` (6 or 7) are required peers. `@softistx/limix` is the caret range
of the version this release was built against (the repository's `workspace:^`
becomes `^<version>` when the package is packed).

The GraphQL endpoint (`@softistx/limix-alxia/graphql`) needs four more peers,
optional because the REST guard does not: install them only when you use it.

```sh
bun add @softistx/limix-graxia @softistx/alxia-graphql @softistx/graxia graphql
```

`@softistx/alxia-graphql` 0.20.2 or later, `@softistx/graxia` 0.18.0 or later
(both below 1.0.0), `graphql` 17.1 or later 17.x, and `@softistx/limix-graxia`.
Your tsconfig resolves as a bundler does (`"moduleResolution": "bundler"`): the
declarations import without extensions, so `nodenext` is not supported.

## Subpaths

| Subpath | What it holds |
| --- | --- |
| `@softistx/limix-alxia` | `limixGuard`, `alxiaOperations`, `checkRoutes`, `checkGuard` and their types (`RouteIssue` among them) |
| `@softistx/limix-alxia/graphql` | `limixGraphql`: alxia-graphql's `graphql()` with the rules in front of every field |

## Usage

### Guard the routes

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard } from '@softistx/limix-alxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    '/health': { GET: { public: true } },
    '/notes/:id': { GET: { authenticated: true }, DELETE: { roles: [['admin']] } },
  },
}))

const app = alxia()

app.use(limixGuard({
  policy,
  app, // the app, or group, this guard is given to
  // Read once per request that reaches a route.
  claims: (ctx: { request: Request }) => {
    const token = ctx.request.headers.get('authorization')?.replace(/^Bearer /, '')
    return token === 'admin-token'
      ? { authenticated: true, roles: ['admin'], subject: { type: 'user', id: 'u1' } }
      : { authenticated: Boolean(token) }
  },
}))

app.get('/health', ({ reply }) => reply(200, { ok: true }))
app.get('/notes/:id', ({ reply }) => reply(200, { note: true }))
app.delete('/notes/:id', ({ reply }) => reply(200, { deleted: true }))
```

An anonymous `GET /notes/1` answers `401 { "code": "auth.errors.unauthenticated" }`,
a signed-in non-admin `DELETE` answers `403`. The [alxia guide](docs/alxia.md)
covers middleware order, tenants, relations, refusals, outages and bodies.

### Cover the routes

```ts
import { compilePolicy, definePolicy } from '@softistx/limix'
import { coverage } from '@softistx/limix/coverage'
import { alxia } from '@softistx/alxia'
import { alxiaOperations } from '@softistx/limix-alxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/health': { GET: { public: true } } },
}))
const app = alxia()
  .get('/health', ({ reply }) => reply(200, { ok: true }))
  .get('/orders', ({ reply }) => reply(200, []))

const report = coverage(policy, alxiaOperations(app))
console.log(report.summary.uncovered) // 2: GET /orders and HEAD /orders
```

### Check the rules fit the routes

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { checkRoutes } from '@softistx/limix-alxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/helth': { GET: { public: true } } }, // a typo
}))
const app = alxia().get('/health', ({ reply }) => reply(200, { ok: true }))

const issues = checkRoutes(policy, app)
// [{ kind: 'unmatched-rule', path: 'GET /helth',
//    message: 'no route of the app takes this rule, ...', fix: '...' }]
```

It returns a `readonly RouteIssue[]` (empty means fine) and never throws. Call it
in a spec, `expect(checkRoutes(policy, app)).toEqual([])`, or once the routes are
declared at boot. `checkGuard(guard, app)` has the same shape. A `RouteIssue` is
`{ kind, path, message, fix }`, with `kind` one of `rung-code`, `unmatched-rule`,
`open-route` and `separated-guards`.

### Serve GraphQL behind the same rules

```ts
import { alxia } from '@softistx/alxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { limixGuard, type LimixAlxiaOptions } from '@softistx/limix-alxia'
import { limixGraphql } from '@softistx/limix-alxia/graphql'
import { buildSchema } from 'graphql'

const schema = buildSchema(`type Query { me: String }`)
const app = alxia()

const limix: LimixAlxiaOptions<{ request: Request }> = {
  policy: compilePolicy(definePolicy({
    limix: 1,
    global: { unmatched: 'deny' },
    graphql: { Query: { me: { authenticated: true } } },
  })),
  claims: (ctx) => ({ authenticated: ctx.request.headers.has('authorization') }),
  app,
}

app.use(limixGuard(limix))
limixGraphql(app, { schema, limix }) // the SAME object
```

## Traps

- Declare routes after `app.use(limixGuard(...))`: a route declared before it
  never runs the guard, so it would stay open. `limixGuard()` throws when the
  app already holds one (a health route gets a `public: true` rule).
- Give `limixGraphql` the guarded app (or a group or plugin mounted on it): the
  endpoint is known by its handler there and left to the field rules. A REST
  route of your own at `POST /graphql` is judged by the REST rules.
- Several rules files on one app: a group or prefixed plugin with its own
  `limixGuard` (and `limixGraphql`) is judged by that guard alone, the innermost
  one that owns the route. The outer file names none of its routes; an outer
  rule for one makes `checkRoutes` report it and the guard answer 503
  `policy-mismatch`. See `docs/alxia.md`.
- Requests are judged by the decoded path as the handler sees it, so a literal
  `/users/me` rule written before `/users/:id` applies, and `/users/%6De` is
  `/users/me`.
- A route declared between `limixGuard()` and its `use()` stays open: an app
  started through `listen` stops at once (the guard's `onStart` hook), and
  `expect(checkGuard(guard, app)).toEqual([])` pins it in a spec.
- Each `fork()` carries its own guard (`limixGuard({ ..., app: fork })`); a
  guard on the base still judges fork routes, by rules never checked against
  them, and answers 503 `policy-mismatch` only when a rule names a fork-only
  route.
- `onUnavailable` runs once per outage for REST and GraphQL together;
  `onMismatch(problems)` replaces the `console.error` for an unfit policy.
- JSON bodies are detected as alxia does (any type mentioning `json`); a custom
  `app.parser` is not seen by body rules, and `when` never sees `request.json`.
- An `all` route also takes methods such as `PROPFIND` that `alxiaOperations`
  cannot list; they fall under `unmatched`.
- A public route behind a bearer middleware needs a token anyway: the
  authentication layer refuses before the guard runs
  ([why](docs/troubleshooting.md#a-public-route-needs-a-token-bearer-has-no-optional-mode)).

## Stability

After 1.0, a new issue `kind` or error code is a minor release: handle an
unknown one (a `default` branch) instead of closing the switch. The full policy
is in the core README's
[Stability](https://github.com/softistx/limix/blob/develop/packages/limix/README.md#stability)
section.

## Documentation

See [docs/](docs/README.md):

- [Migrating from `@softistx/security`](https://github.com/softistx/limix/blob/develop/packages/limix/docs/migrating-from-security.md): each change with the 5.x code and the limix code.
- [alxia guide](docs/alxia.md): the guard, tenants, relations, refusals, outages, GraphQL, coverage.
- [Troubleshooting](docs/troubleshooting.md): the errors and refusals this package gives.
- [Roadmap](docs/roadmap.md): what is coming.
