# GraphQL

Put a limix rules file in front of the fields of a graxia schema: `guardSchema`
wraps the fields, `limixGraxia` is the graxia plugin that goes with it. The
rules themselves (`graphql:` in the rules file, `public`, `authenticated`,
`roles`, `permissions`, `when`, `relations`) are described in the
[limix rules](https://github.com/softistx/limix/blob/develop/packages/limix/docs/rules.md) and
[evaluation](https://github.com/softistx/limix/blob/develop/packages/limix/docs/evaluation.md) guides.

## The smallest complete example

```ts
import { createGraxia } from '@softistx/graxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { guardSchema, limixGraxia } from '@softistx/limix-graxia'
import { buildSchema } from 'graphql'

const schema = buildSchema(`
  type Query { me: String  notes: [String!] }
`)

const options = {
  policy: compilePolicy(definePolicy({
    limix: 1,
    global: { unmatched: 'deny' },
    graphql: { Query: { me: { authenticated: true }, notes: { public: true } } },
  })),
  claims: (ctx: { request: Request }) => ({
    authenticated: ctx.request.headers.has('authorization'),
  }),
}

export const graxia = createGraxia({
  schema: guardSchema(schema, options),
  plugins: [limixGraxia(options)],
  context: ({ request }: { request: Request }) => ({ request }),
})
```

Share one `options` object between `guardSchema` and `limixGraxia`. The schema
you pass to `createGraxia` is the one `guardSchema` returned: the original is
never changed, and the plugin throws at setup for a schema `guardSchema` did
not make (its fields would be open).

## Options

```ts
interface LimixGraxiaOptions<Ctx> {
  policy: CompiledPolicy | PolicySource
  claims: (ctx: Ctx) => Claims | Promise<Claims>
  relations?: RelationChecker | ((ctx: Ctx) => RelationChecker)
  mapRefusal?: (refusal: LimixRefusal, at: RefusalAt) => RefusalAnswer | undefined
  nonNull?: 'refuse' | 'allow'
  onUnavailable?: () => void
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `policy` | `CompiledPolicy \| PolicySource` | required | The rules. A compiled policy is fixed and checked against the schema at setup; a [source](https://github.com/softistx/limix/blob/develop/packages/limix/docs/remote.md) (`mutableSource`, the remote client) is read on every call, may hold none, and has each policy it holds checked against the schema once (see [a policy that does not fit](#a-policy-that-does-not-fit-the-schema)) |
| `claims` | `(ctx) => Claims \| Promise<Claims>` | required | Who is calling. Read once per operation with the plugin, once per governed field without it (see [claims](#claims-through-the-graxia-context-option)); must return an object |
| `relations` | `RelationChecker \| (ctx) => RelationChecker` | none | Answers the rules' relation checks, for instance `janusRelations()` of `@softistx/limix-janus`. A function of the context is called once per operation with the plugin, once per governed field without it. A static policy whose rules use relations throws at setup without it |
| `mapRefusal` | `(refusal, at) => { code?, message?, status? } \| undefined` | none | Rewords a refusal's code, message or status. Return `undefined` to keep it |
| `nonNull` | `'refuse' \| 'allow'` | `'refuse'` | What a static policy does with a named non-null field, see [the non-null rule](#the-non-null-rule) |
| `onUnavailable` | `() => void` | none | Called once each time a policy source stops holding a policy |

## Claims through the graxia `context` option

`claims` receives the object your graxia `context` option returned. With the
plugin, it is read once per operation and shared by every field of it: the
plugin exposes the answer as `ctx.limix.claims()`. `relations`, when it is a
function of the context, is called once per operation the same way.

Without the plugin (a raw graphql-js host: `guardSchema` and `execute()`),
nothing is remembered: `guardSchema` calls `claims(ctx)` and `relations(ctx)`
for every governed field it resolves, so a host that reuses one context object
for several callers always sees the caller of the moment, at the price of one
claims read per governed field. Only the context the plugin made is trusted: a
`ctx.limix` of your own is ignored.

`claims` is typed against your host context: the plugin carries the type of
its `ctx` parameter, so `createGraxia` refuses, at compile time, a `context`
factory that does not return what `claims` reads.
Annotate `ctx`: left bare it is typed as an empty object, and reading
`ctx.request` then fails to compile.

```ts
type Ctx = { request: Request }

const options = {
  policy,
  claims: async (ctx: Ctx) => {
    const user = await verify(ctx.request.headers.get('authorization'))
    return user
      ? { authenticated: true, subject: { type: 'user', id: user.id }, scope: user.scope }
      : { authenticated: false }
  },
}
```

`LimixContext` is the shape the plugin adds to the context
(`{ limix: { claims(): Promise<Claims> } }`): use it in your own resolvers to
read the claims again without a second lookup. It exists only with the plugin.

```ts
import type { LimixContext } from '@softistx/limix-graxia'

const resolvers = {
  Query: {
    mine: async (_: unknown, __: unknown, ctx: LimixContext) => (await ctx.limix.claims()).subject,
  },
}
```

An answer that is not an object throws a `TypeError` (see
[troubleshooting](troubleshooting.md)); the error propagates and graxia masks
it, as for any resolver error.

## Which fields are guarded

| Policy | Wrapped | Left as is |
| --- | --- | --- |
| Static (`CompiledPolicy`) | The fields a rule names, and every root field when `unmatched` is `deny` | Every other field, with the same resolver |
| Source (`PolicySource`) | Every object field | Introspection types. At run time a field passes straight through (no promise, no claims read) when the snapshot holds a policy that fits the schema, has no rule on it and it is not a root field under `deny` |

A root field is a field of the schema's Query, Mutation or Subscription type,
whatever the schema calls them (`schema { query: RootQuery }` works). A field
of another type with no rule is let through, as in
[`evaluateField`](https://github.com/softistx/limix/blob/develop/packages/limix/docs/evaluation.md).

A governed field that has no resolver of its own runs graphql's
`defaultFieldResolver`; an `execute({ fieldResolver })` override (a custom
default resolver of your host) is not used for it. Give such a field a
`resolve` of its own, or leave it out of the rules.

A realistic wiring, schematic (`claimsOf`, `access` and `schema` are your own): relations through janus, a swapped policy, a Hono mount.

```ts
import { createGraxia } from '@softistx/graxia'
import { mutableSource } from '@softistx/limix'
import { janusRelations } from '@softistx/limix-janus'
import { guardSchema, limixGraxia } from '@softistx/limix-graxia'
import { Hono } from 'hono'

const source = mutableSource() // holds nothing until you swap a policy in

const options = {
  policy: source,
  claims: (ctx: { request: Request }) => claimsOf(ctx.request),
  relations: janusRelations({ access }),
  onUnavailable: () => console.error('limix: no policy held, refusing every field'),
}

const graxia = createGraxia({
  schema: guardSchema(schema, options),
  plugins: [limixGraxia(options)],
  context: ({ request }: { request: Request }) => ({ request }),
})

export const app = new Hono().all('/graphql', (c) => graxia.fetch(c.req.raw))
```

## Refusals and their extensions

A refused field throws a `GraphQLError` whose message is the refusal's code.

| Extension | When | Value |
| --- | --- | --- |
| `code` | always | `auth.errors.unauthenticated` (401), `auth.errors.forbidden` (403), `auth.errors.not-found` (404), a rule's own `auth.errors.*` code, or `limix.errors.unavailable` (503) |
| `status` | always | The refusal's HTTP status |
| `params` | when there are some | For instance `{ reason: 'no-policy' }` on a 503 |
| `http` | only for a refused top-level field of the operation | `{ status }`, and `headers: { 'retry-after': '5' }` on a 503. graxia answers that HTTP status |

A refusal on a nested field carries no `http`: the response stays a `200` with
partial data and the error at its path. "Nested" is decided per call, by where
the field sits in the operation, not by its type: `Query.secret` reached through
`mutation { save { query { secret } } }` is nested and carries no `http`.

```jsonc
// POST { me } by an anonymous caller: HTTP 401
{ "data": { "me": null },
  "errors": [{ "message": "auth.errors.unauthenticated", "path": ["me"],
    "extensions": { "code": "auth.errors.unauthenticated", "status": 401,
                    "http": { "status": 401 } } }] }
```

`mapRefusal` rewords one without touching the others:

```ts
import type { MapRefusal } from '@softistx/limix-graxia'

// A signed-in caller who may not see a field learns nothing: answer "not found".
const hide: MapRefusal = (refusal) =>
  refusal.code === 'auth.errors.forbidden'
    ? { code: 'auth.errors.not-found', status: 404, message: 'Not found' }
    : undefined
```

```ts
interface RefusalAt { type: string; field: string; root?: boolean }
interface RefusalAnswer { code?: string; message?: string; status?: number }
```

`at.type` is `''` for a refusal a resolver threw itself (below): a result's
error carries the field and its path but not its parent type.

`refusalError(refusal, mapRefusal?, at?, topLevel?)` builds the same error;
`topLevel` says whether it sits at the top of the operation (it asks for the
`http` status) and defaults to `at.root`. Use it when you call `evaluateField`
yourself and want the same shape:

```ts
import { evaluateField, isLimixRefusal } from '@softistx/limix'
import { refusalError } from '@softistx/limix-graxia'

const decision = await evaluateField(policy, { type: 'Query', field: 'me', claims })
if (!decision.allow) throw refusalError(decision.refusal, undefined, { type: 'Query', field: 'me', root: true })
```

A resolver that throws a `LimixRefusal` itself (say from a nested
`evaluateField`) gets the same treatment: the plugin remaps it in a plain
result, in each subscription event and in each `@defer` or `@stream` payload.

## Subscriptions

A Subscription root field is guarded twice. The refusal at subscribe time opens
no iterator: the client gets the error and no event. Each event is then
evaluated again with `source` set to the event payload and the same claims, so
a rule can look at what is being delivered. A refused event is delivered as
`null` plus an error, and the stream goes on.

The claims are read once, when the subscription starts, and every event reuses
them: a token revoked while the stream is open keeps receiving events until
the client reconnects. The policy, on the other hand, is read again for every
event, so a swapped or withdrawn policy takes effect on the next event (a
withdrawn one refuses it as `limix.errors.unavailable`).

A subscription starts with no `source`: a relation whose `from` reads
`source.` fails at subscribe, so `guardSchema` refuses such a rule at setup for
a static policy, and a policy source holding one is refused whole as
`policy-mismatch` (every guarded field answers 503). Read `args.` instead.

## Outage and `onUnavailable`

With a policy source that holds nothing (no rules loaded yet, or withdrawn),
every guarded field answers `limix.errors.unavailable`, status 503, params
`{ reason: 'no-policy' }`, and a refused top-level field adds `retry-after: 5`.
Nothing is allowed by default: the guard fails closed.

`onUnavailable` runs once when the source goes from holding a policy to holding
none (and once at the first call if it never held one), then again only after
a policy came back and left. It is a hook for a log line or a metric, not a
retry:

```ts
const source = mutableSource(policy)
const options = { policy: source, claims, onUnavailable: () => metrics.increment('limix.unavailable') }
guardSchema(schema, options)
source.swap(null) // the next call refuses with 503 and fires onUnavailable once
source.swap(policy) // served again, no new schema needed
```

A source is read once per guarded field, not once per operation: a policy
swapped while an operation runs can judge two of its fields by two policies.

A remote client from `@softistx/limix` keeps its last good copy through an
outage; see the [remote guide](https://github.com/softistx/limix/blob/develop/packages/limix/docs/remote.md).

## The non-null rule

A refused field throws, and graphql-js turns the error of a non-null field into
`null` for its parent. A rule on `Note.title: String!` would blank the whole
note. With a static policy and `nonNull: 'refuse'` (the default), `guardSchema`
throws at setup for any named non-null field, with a message naming the field
and both cures: make it nullable, or pass `nonNull: 'allow'` when the null
parent is what you want.

```ts
guardSchema(schema, { ...options, nonNull: 'allow' })
```

A policy source is not checked for non-null fields (it may hold nothing yet):
to keep the check, run `guardSchema(schema, { ...options, policy: compiledFile })`
in a spec.

## A policy that does not fit the schema

A source can be handed any policy after `guardSchema` ran, so the guard checks
each policy it holds against the schema, once per policy: a rule on an unknown
type, on an interface or another type that is not an object type, on a
field the type lacks, or a Subscription rule whose relation reads `source.`.
Such a policy would silently enforce nothing for that
rule, so the guard treats it as unavailable: every guarded field answers
`limix.errors.unavailable`, status 503, params `{ reason: 'policy-mismatch' }`,
and `onUnavailable` fires once, as for an empty source. Swap a fitting policy
in and the next call is served.

```ts
source.swap(policyWithATypo) // every field now refuses with policy-mismatch
source.swap(fixedPolicy)     // served again, no new schema needed
```

A static policy is checked at setup instead (below).

## Setup checks

For a static policy `guardSchema` throws one `TypeError` listing every problem
it found:

- a rule on a type the schema does not have;
- a rule on a type that is not an object type (an interface, union, input,
  scalar or enum);
- a rule on a field the type does not have;
- a named non-null field, unless `nonNull: 'allow'`;
- a Subscription rule with a relation that reads `source.`.

`guardSchema` also throws when handed a schema it already produced, and, for a
static policy whose rules use relations, when `relations` is missing. Every
message is in [troubleshooting](troubleshooting.md).

## Coverage

`graphqlOperations` lists the operations of a schema in the shape
`coverage(policy, operations)` of `@softistx/limix/coverage` takes, so a spec
can fail on a field no rule names.

```ts
import { coverage } from '@softistx/limix/coverage'
import { graphqlOperations } from '@softistx/limix-graxia'

const report = coverage(policy, graphqlOperations(schema, { fields: 'all' }))
expect(report.summary.uncovered).toBe(0)
expect(report.stale).toEqual([]) // a rule on a field the schema no longer has
```

```ts
function graphqlOperations(
  source: GraphQLSchema | string,
  options?: { fields?: 'roots' | 'all' },
): GraphqlOperation[] // { kind: 'graphql', type, field, root }
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `fields` | `'roots' \| 'all'` | `'roots'` | `'roots'`: the fields of the Query, Mutation and Subscription types, in that order. `'all'` adds the fields of every other object type (introspection excluded) with `root: false` |

A renamed root keeps its real name and `root: true`. A string is read as SDL
(`extend type`, `schema { query: ... }` included) without building a schema, so
a spec can read the `.graphql` file as is. As in a built schema, once the SDL
has a `schema { ... }` block or extension only the types it names are roots: a
type called `Mutation` that the block leaves out is an ordinary type
(`root: false`). See the
[coverage guide](https://github.com/softistx/limix/blob/develop/packages/limix/docs/coverage.md)
for the report.

Next: [`@needs` and `canOf`](needs.md).
