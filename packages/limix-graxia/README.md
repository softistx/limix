# @softistx/limix-graxia

The GraphQL integration of [`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md):
it puts a rules file in front of the fields of a [graxia](https://www.npmjs.com/package/@softistx/graxia)
(graphql-js) schema, checks the rules against the schema's `@needs` directives,
and lists the operations a coverage test reads.

## Install

The package is published with restricted access: installing it needs an npm
token that can read the `@softistx` scope.

```sh
bun add @softistx/limix-graxia @softistx/limix @softistx/graxia graphql
```

`@softistx/limix`, `@softistx/graxia`, `graphql` and `typescript` (6 or 7) are
required peers. `@softistx/graxia` must be 0.18.0 or later and below 1.0.0,
`graphql` 17.1 or later 17.x, and `@softistx/limix` the caret range of the
version this release was built against (the repository's `workspace:^` becomes
`^<version>` when the package is packed). Your tsconfig resolves as a bundler
does (`"moduleResolution": "bundler"`, which Bun and every bundler use): the
declarations import without extensions, so `nodenext` is not supported.

## Usage

| Export | What it is |
| --- | --- |
| `guardSchema(schema, options)` | A copy of the schema whose fields answer to the rules; the original is never touched |
| `limixGraxia(options)` | The graxia plugin: reads the claims once per operation, refuses an unguarded schema, remaps refusals in every result |
| `refusalError(refusal, mapRefusal?, at?)` | A refusal as the `GraphQLError` a guarded field throws |
| `graphqlOperations(schemaOrSdl, { fields? })` | The operations of a schema, for `coverage()` |
| `checkNeeds(policy, schema)` | Where a field's `@needs` and the rule that guards it disagree |
| `canOf(claims)` | The `can` predicate of `@softistx/graxia/agent` and `@softistx/graxia-mcp` |
| `isGuarded(schema)` | Whether `guardSchema` made this schema |
| types `LimixGraxiaOptions`, `LimixContext`, `MapRefusal`, `RefusalAnswer`, `RefusalAt`, `NeedsIssue`, `NeedsIssueKind`, `GraphqlOperationsOptions` | The shapes the functions take and return |
| `@softistx/limix-graxia/package.json` | The package manifest |

### Guard a graxia API

```ts
import { createGraxia } from '@softistx/graxia'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { guardSchema, limixGraxia } from '@softistx/limix-graxia'
import { buildSchema } from 'graphql'

const schema = buildSchema(`
  type Query { me: String  notes: [String!]! }
  type Mutation { retire(id: ID!): Boolean }
`)

const options = {
  policy: compilePolicy(definePolicy({
    limix: 1,
    global: { unmatched: 'deny' },
    graphql: {
      Query: { me: { authenticated: true }, notes: { public: true } },
      Mutation: { retire: { permissions: [['notes:retire']] } },
    },
  })),
  // Read once per operation, from what your `context` option returned.
  claims: (ctx: { request: Request }) => ({
    authenticated: ctx.request.headers.has('authorization'),
    scope: ctx.request.headers.get('x-scope') ?? '',
  }),
}

export const graxia = createGraxia({
  schema: guardSchema(schema, options), // never pass the original schema
  plugins: [limixGraxia(options)],
  context: ({ request }: { request: Request }) => ({ request }),
})
```

An anonymous `{ me }` answers a `401` with `extensions.code`
`auth.errors.unauthenticated`. The [GraphQL guide](docs/graphql.md) covers
claims, relations, subscriptions, refusals, outages and the setup checks.

### Check `@needs` against the rules

```ts
import { compilePolicy, definePolicy } from '@softistx/limix'
import { checkNeeds } from '@softistx/limix-graxia'
import { agentTypeDefs } from '@softistx/graxia/agent'
import { buildSchema } from 'graphql'

const schema = buildSchema(`${agentTypeDefs}
  type Query { write: String @needs(permission: "books:write") }`)
const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'allow' },
  graphql: { Query: { write: { permissions: [['books:admin']] } } },
}))

for (const issue of checkNeeds(policy, schema)) {
  console.log(issue.kind, issue.coordinate, issue.fix)
}
```

Run it in a spec: a field whose directive and rule disagree is listed. See the
[`@needs` guide](docs/needs.md) for every issue kind and `canOf`.

### Cover the schema

```ts
import { compilePolicy, definePolicy } from '@softistx/limix'
import { coverage } from '@softistx/limix/coverage'
import { graphqlOperations } from '@softistx/limix-graxia'

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  graphql: { Query: { me: { authenticated: true } } },
}))

// SDL text is read without building a schema; a GraphQLSchema works too.
const report = coverage(policy, graphqlOperations('type Query { me: String notes: [String] }'))
// report.summary.uncovered === 1: Query.notes
```

### Hide what a caller may not call

```ts
import { printSchemaFor } from '@softistx/graxia/agent'
import { canOf } from '@softistx/limix-graxia'
import { buildSchema } from 'graphql'
import { agentTypeDefs } from '@softistx/graxia/agent'

const schema = buildSchema(`${agentTypeDefs}
  type Query { read: String  write: String @needs(permission: "books:write") }`)

printSchemaFor(schema, { can: canOf({ authenticated: true, scope: 'books:read' }) })
// the SDL without `write`
```

## Traps

- Pass the schema `guardSchema` returned to `createGraxia`, never the original:
  the plugin refuses to start otherwise, since the original's fields are open.
- A static policy refuses a named non-null field at `guardSchema` (a refusal
  would null its parent): make the field nullable, or pass `nonNull: 'allow'`.
- A policy source passes every field the snapshot has no rule on, root fields
  under `unmatched: deny` excepted; a rule on a missing field is only caught
  for a static policy, so run `guardSchema(schema, { policy: compiled, ... })`
  in a spec.

## Documentation

See [docs/](docs/README.md):

- [GraphQL guide](docs/graphql.md): the guard, the plugin, refusals, outages.
- [`@needs` guide](docs/needs.md): `checkNeeds` and `canOf`.
- [Troubleshooting](docs/troubleshooting.md): the errors this package throws.
- [Roadmap](docs/roadmap.md): what is coming.
