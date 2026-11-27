# `@needs` and `canOf`

graxia's `@needs(permission:)` directive says which permission a field needs, so
an agent (MCP) is shown only what its caller may call. limix rules say the same
thing as an enforcement. `checkNeeds` finds where the two disagree, and `canOf`
answers the `can` predicate graxia asks, from the same claims the rules read.

## The smallest complete example

```ts
import { agentTypeDefs } from '@softistx/graxia/agent'
import { compilePolicy, definePolicy } from '@softistx/limix'
import { checkNeeds } from '@softistx/limix-graxia'
import { buildSchema } from 'graphql'

const schema = buildSchema(`${agentTypeDefs}
  type Query { write: String @needs(permission: "books:write") }`)

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'allow' },
  graphql: { Query: { write: { permissions: [['books:write']] } } },
}))

checkNeeds(policy, schema) // []: the directive and the rule agree
```

## `checkNeeds`

```ts
function checkNeeds(policy: CompiledPolicy, schema: GraphQLSchema): NeedsIssue[]

interface NeedsIssue {
  kind: NeedsIssueKind
  coordinate: string   // 'Type.field'
  path: string         // 'graphql.Type.field': the place in the rules file
  message: string
  fix: string
  needs: string[][]    // what @needs asks, as AND of (OR of permissions)
  permissions?: string[][] // what the rule asks, as OR of (AND of permissions)
  suggestion?: string  // rule-without-needs only: the @needs text to add
}
```

It reads every object field of the schema (introspection excluded) and returns
the issues in schema order; none means they agree. For a field `T.f` the
directives that count are the ones on `T`, on `f`, and on the object or
interface type `f` returns (one level), all required at once. Only permissions
are compared: `roles`, `when`, `authenticated` and relations are extra
restrictions `@needs` cannot express, so a rule with them and the same
permissions raises nothing.

Call it from a spec, not at startup:

```ts
import { expect, test } from 'bun:test'

test('@needs says what the rules enforce', () => {
  expect(checkNeeds(policy, schema)).toEqual([])
})
```

### The issue kinds

| Kind | The field | Fix |
| --- | --- | --- |
| `needs-invalid` | has a `@needs` giving both `permission` and `anyOf`, or neither: no caller meets it | give exactly one |
| `needs-without-rule` | has `@needs` and the rules have no entry for it | add a rule with those permissions |
| `needs-unenforced` | has `@needs` and its rule is `public` or lists no permissions | put the permissions in the rule, or drop `@needs` |
| `needs-looser` | has a `@needs` a caller can meet and still be refused by the rule | add the rule's permissions to `@needs`, or relax the rule |
| `needs-stricter` | has a `@needs` that hides the field from a caller the rule lets in | drop the extra from `@needs`, or add it to the rule |
| `rule-without-needs` | has a rule with permissions and no `@needs`: the caller who lacks them still sees the field | add the directive in `suggestion` |
| `needs-too-complex` | has a `@needs` that expands to more than 1024 alternatives | split the any-of groups |

One example for each, with the rule that goes with it:

```ts
const schema = buildSchema(`${agentTypeDefs}
  type Query {
    broken: String @needs
    orphan: String @needs(permission: "a:read")
    unenforced: String @needs(permission: "a:read")
    looser: String @needs(permission: "books:write")
    stricter: String @needs(permission: "a:read") @needs(permission: "a:extra")
    silent: String
  }`)

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'allow' },
  graphql: {
    Query: {
      unenforced: { authenticated: true },
      looser: { permissions: [['books:admin']] },
      stricter: { permissions: [['a:read']] },
      silent: { permissions: [['s:read', 's:list'], ['s:all']] },
    },
  },
}))

for (const issue of checkNeeds(policy, schema)) console.log(issue.kind, issue.coordinate)
// needs-invalid Query.broken            (neither permission nor anyOf)
// needs-without-rule Query.orphan       (no rule)
// needs-unenforced Query.unenforced     (the rule asks no permission)
// needs-looser Query.looser             (books:write is met, books:admin is not)
// needs-stricter Query.looser           (and the reverse: books:admin does not give books:write)
// needs-stricter Query.stricter         (a:extra is required nowhere in the rule)
// rule-without-needs Query.silent
```

`rule-without-needs` carries the exact text to add in `suggestion`; the package
never writes it to a schema:

```ts
issue.suggestion
// '@needs(anyOf: ["s:read","s:all"]) @needs(anyOf: ["s:list","s:all"])'
```

`needs-too-complex` appears when many `@needs(anyOf: ...)` multiply: eleven
directives of two permissions each make 2048 alternatives. Comparing them with
the rule is not attempted; reduce the groups.

## `canOf`

```ts
function canOf(claims: Claims): (permission: string) => boolean
```

A permission holds for a signed-in caller (`authenticated: true`) when the rules
would read it as held: it is a token of `scope`, and also in `permissions` when
that list is present. Roles are never read, and an anonymous caller holds
nothing. It is synchronous and pure; it throws a `TypeError` for a value that is
not an object.

```ts
import { agentTypeDefs, printSchemaFor } from '@softistx/graxia/agent'
import { canOf } from '@softistx/limix-graxia'
import { buildSchema } from 'graphql'

const schema = buildSchema(`${agentTypeDefs}
  type Query { read: String  write: String @needs(permission: "books:write") }`)

printSchemaFor(schema, { can: canOf({ authenticated: true, scope: 'books:read' }) })
// the SDL without `write`
```

### With graxia-mcp

`@softistx/graxia-mcp` calls your `can` once per request with the verified
token's `McpAuthInfo`. Map it to the claims your rules read, and hand the same
function to `canOf`, so the agent sees exactly what the guard would let it call.

```ts
import type { McpAuthInfo } from '@softistx/graxia-mcp'
import type { Claims } from '@softistx/limix'
import { canOf } from '@softistx/limix-graxia'

export function claimsOfAuth(auth: McpAuthInfo | undefined): Claims {
  if (auth === undefined) return { authenticated: false }
  return {
    authenticated: true,
    ...(auth.subject === undefined ? {} : { subject: { type: 'user', id: auth.subject } }),
    scope: auth.scopes.join(' '),
  }
}

// createMcp(graxia, { name: 'api', auth, can: (_request, _ctx, auth) => canOf(claimsOfAuth(auth)) })
```

Use the same `claimsOfAuth` in the `claims` option of `guardSchema`
(`mcpAuth()` of graxia-mcp returns the verified info inside a request), so what
the agent is shown and what the guard enforces come from one reading of the
token. Keep the `@needs` permissions and the rules' `permissions` in agreement
with [`checkNeeds`](#checkneeds).

See [GraphQL](graphql.md) for the guard itself.
