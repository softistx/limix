# Troubleshooting `@softistx/limix`

Each entry is headed by the text you see: a compiler error, a message, or an
error `code`. Search this page for the words of your message.

A `RulesError` prints one line per issue, `path: message`; the headings below
are the messages. `<...>` stands for the part that varies.

## Invalid rules: N issues

`parseRules` or `loadRules` found the document invalid. The lines under it name
each issue and where it is. Fix them all, then retry; the list is complete. When
the rules came from a file, the first line also names it
(`Invalid rules in rules.yaml: 2 issues`).

## Invalid input: expected 1

The `limix` key is missing or is not `1`. Open the document with `limix: 1`.

## Invalid input: expected object, received undefined

At `global`: the document has no `global` block. Add one with the required
`unmatched`:

```yaml
limix: 1
global:
  unmatched: deny
```

## Invalid option: expected one of "allow"|"deny"

`global.unmatched` is missing or misspelled. It is required: `allow` lets a path
or field no rule names through, `deny` refuses it.

## unknown key `<key>`

A key that is not part of the format: a typo in a rule term, a method that does
not exist (`GTE`), or a top-level key such as `rule`. Only `x-` keys are
tolerated at the top level, for YAML anchors.

## `keto` is removed: use relations

Rename `keto` to `relations`, and write its terms as
`{ relation, type, from }`.

## `authorities` is renamed: use roles (a list of alternatives, each a list that must all hold)

`authorities` was a list of groups, outer AND and inner OR. `roles` is the
other way round, like `permissions`: outer OR, inner AND. Convert
`[[A, B], [C]]` (A or B, and C) to `[[A, C], [B, C]]`.

## `expression` is removed: a rules file carries no code. Register a predicate in code and name it with when: [name]

Move the expression into a function, register it, and name it:

```ts
compilePolicy(rules, { conditions: { ownsDocument: ({ claims, request }) => /* ... */ } })
```

```yaml
when: [ownsDocument]
```

## `cors` is removed: it was never enforced

Delete the key. `rateLimit` and `global.providers` carry the same message and
the same fix: they did nothing in `@softistx/security` 5.

## `message` is renamed `code`: it is the refusal's code

On a relation rung, `message` is now `code`: the code of the refusal the rung
answers with. Rename it. Put a custom code under `auth.errors.`, since
`@softistx/alxia-access` reads no other prefix (but `tenancy.errors.`).

## `namespace` is renamed: use type

In a relation term, `namespace` is now `type`. Rename it.

## `id` is renamed: use from

In a relation term, `id` (where the object id is read from) is now `from`.

## `from` must be "param.<name>", "query.<name>" or "json.<path>"

A REST relation term reads its id from the request: `param.`, `query.` or
`json.`. A rule written for one transport cannot be pasted in the other without
changing `from`.

## `from` must be "args.<path>" or "source.<path>"

The GraphQL variant: a relation term on a GraphQL field reads its id from the
field's `args` or its `source`. Rewrite `param.id` as `args.id`.

## `param.<name>` names no parameter of the pattern: it captures <names>

A REST relation term reads `param.<name>`, and the route's pattern captures no
parameter of that name (the message lists what it does capture, or `none`).
This includes the default: a term with no `from` reads `param.id`, so a pattern
without `:id` needs a `from`. Fix the name, or the pattern:

```yaml
/documents/:documentId:
  PUT:
    relations:
      - require: [[{ relation: edit, type: document, from: param.documentId }]]
```

## Invalid input: expected string, received number

Zod's own wording, for a value of the wrong type (here at `global.basePath`: a
number where a string belongs). The path before the colon says where; the
message says what was expected and what was found. Fix the value's type. The
same shape covers `expected array, received string`, `expected boolean, ...`
and the rest.

## Too small: expected array to have >=1 items

A list that must name something is empty: `roles`, `permissions`, `when`,
`relations`, `require`, or an alternative inside them (`[[]]`). An empty
alternative would admit everyone, an empty list nobody. Delete the key, or fill
it. For a rule that needs only a signed-in caller, write
`authenticated: true`.

## unknown condition `<name>`: registered <names>

`when` names a condition that `compilePolicy` was not given. The message lists
the registered ones. Register it, or fix the name:

```ts
compilePolicy(rules, { conditions: { workingHours } })
```

## `authenticated` and `public` are contradictory: a rule either requires a signed-in caller or admits anonymous ones

Keep one of the two.

## `public` and `relations` are contradictory: a relation check asks what the caller may do to an object, and a public rule admits callers there is nothing to ask about

Remove `public: true`, or the `relations`.

## `public` and `roles` are contradictory: a public rule admits every caller, and `roles` would narrow who may reach it

`permissions` and `when` carry the same message with their own name. A public
rule admits every caller, so a list that narrows who may reach it contradicts
it. Remove `public: true`, or the list; for a signed-in caller only, write
`authenticated: true`. It is checked by `compilePolicy`, on REST and GraphQL.

## `$domain` is removed: per-tenant roles are not in 1.0

A role name contains `$`, the placeholder `@softistx/security` 5 replaced with
the tenant's domain. limix 1.0 has no per-tenant roles: name the role plainly
and decide the tenant in a condition (`when: [name]`) or a relation.

## `get /users` is not a rule key: a flat key is a method (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS, CONNECT, TRACE, QUERY or *), one space, then the path pattern

**When:** a key under `rest` starts with a word, then spaces, then a `/`, and is
not a method in capitals followed by exactly one space.
**Why:** a key written `METHOD /pattern` is a rule (a flat key). One that looks
like one but has a lower-case or unknown method (`get /x`, `PROPFIND /x`) or two
spaces (`GET  /x`) is refused rather than read as a path that holds a space.
**Fix:**

```yaml
rest:
  GET /users:          # not "get /users", not "GET  /users"
    authenticated: true
```

A path that really holds a space starts with `/` (`/a b`) and is a nested key.

## `roles` is a term of a rule, not a method: write "GET /x": {...} or nest it under a method

**When:** a rule term (`roles`, `permissions`, `when`, `authenticated`, `public`,
`relations`) sits directly under a path pattern.
**Why:** under a path pattern the keys are methods. A rule on its own needs the
method in the key.
**Fix:**

```yaml
rest:
  GET /x:              # the method in the key...
    roles: [[admin]]
  /y:                  # ...or nested under it
    GET:
      roles: [[admin]]
```

## `/x` is a path pattern, so its value is keyed by method; write "GET /x" for a single rule

**When:** `compilePolicy` (and so `definePolicy` output) meets a path pattern
whose value holds a key that is not a method. `parseRules` catches the same
mistake earlier, with the hint above.
**Why:** TypeScript cannot tell a path pattern from a flat key, so a rule under
a pattern type-checks; `compilePolicy` refuses it.
**Fix:** put the method in the key, or nest under it, as above.

## a rule's keys are rule terms (roles, permissions, relations, when, authenticated, public); `GET` is not one

**When:** `compilePolicy` (and so `definePolicy` output) meets a flat key
(`"GET /x"`, `"Query.me"`) or a nested rule whose value holds a key that is not
a rule term. The path reads `rest['GET /x']`, `rest['/x'].GET` or
`graphql['Query.me']`.
**Why:** a flat key holds the rule itself, not a method or field map. Such a
rule would have no requirement and allow everyone, so it is refused.
TypeScript cannot tell a flat key from a path pattern in a variable or a spread;
`parseRules` refuses the same mistake earlier.
**Fix:** write the rule's terms under the flat key, or nest under a path or type.

```yaml
rest:
  GET /x:
    roles: [[admin]]     # not: GET /x: { GET: { roles: [[admin]] } }
```

## Editor: `Object literal may only specify known properties ... 'CheckedRestInput<...>'`

**When:** a flat key of `definePolicy` (`'GET /notez'`, `'Query.you'`) is
underlined once a generated file registers the API's operations.
**Why:** the registered list does not hold it.
**Fix:** see [`@softistx/limix-codegen`'s troubleshooting](../../limix-codegen/docs/troubleshooting.md#in-your-editor).

## duplicate rule: rest['POST /users/:id'] and rest['/users/:id'].POST both name POST /users/:id

**When:** two keys give a rule to the same method and pattern, in the same
spelling or one flat and one nested. The same for GraphQL:
`graphql['Query.me'] and graphql.Query.me both name Query.me`.
**Why:** which of the two applies would depend on their order, which is not
what anyone meant. One trailing `/` does not make a pattern different. (Two
patterns that differ only in a parameter name, `/a/:id` and `/a/:uid`, are not
a duplicate: the first takes every path of the second, and coverage reports the
second as stale.)
**Fix:** keep one, or give them different patterns.

```yaml
rest:
  POST /users/:id:
    roles: [[admin]]
  # /users/:id: { POST: ... }   <- remove, it names the same rule
```

## a wildcard names fields, not types: write Type.* (for example Query.*)

**When:** a `graphql` key is `*` or `*.field`.
**Why:** `Type.*` is the rule of every field of one type; there is no rule for
every field of every type.
**Fix:** name the type: `Query.*`, `Note.*`.

## `Query.a.b` is not a field key: write Type.field (for example Query.me) or Type.*

**When:** a `graphql` key holds a dot and is not `Type.field` or `Type.*`.
**Why:** a GraphQL name never holds a dot, so a dotted key is read as a flat
rule; `Query.a.b`, `.me` and `Query.` are not one.
**Fix:** write the type and the field name, or nest the fields under the type:

```yaml
graphql:
  Query.me:
    authenticated: true
```

## `Note` is a type, so its value is keyed by field name; write "Note.field" for a single rule

**When:** `compilePolicy` meets a type name under `graphql` whose value is not a
map of field rules (a rule written straight under the type).
**Fix:** `Note.title: { ... }`, or `Note: { title: { ... } }`.

## YAML Parse error: Unexpected character, or Unresolved alias, at a key starting with `*`

**When:** a rules file holds `* /admin/*:` or `*:` unquoted.
**Why:** in YAML a `*` at the start of a value is an alias. The method `*`, and
a flat key that starts with it, must be quoted.
**Fix:**

```yaml
rest:
  "* /admin/*":
    roles: [[admin]]
  /files/*:
    "*":
      authenticated: true
```

## An authenticated `*` rule answers a CORS preflight 401

**When:** a rule for method `*` (`"* /api/*": { authenticated: true }`) and a
browser calls the route from another origin.
**Why:** `*` includes `OPTIONS`, and a preflight carries no credentials.
**Fix:** an `OPTIONS` rule on the same pattern, which beats the `*` there:

```yaml
rest:
  "* /api/*":
    authenticated: true
  OPTIONS /api/*:
    public: true
```

## invalid path pattern: <reason>

At `rest['<pattern>']`: the path pattern does not parse. The reason names the
problem and the index of the character, and ends with the pattern. Each reason
has its own entry below. `compilePolicy` skips that route and reports every bad
pattern with the other issues, so fix them together.

### Missing parameter name at index N, write :name (for example /:id) or escape the : with a backslash

A bare `:`. Name it (`/:id`), or write `\:` to match a colon. A bare `*` is
fine: it takes the rest of the path and captures nothing (`/files/*`); write
`*path` to capture it.

### Unexpected ( at index N, regular expressions are not supported, escape it with a backslash to match it literally

Also `)`, `[`, `]`, `+`, `?` and `!`. The syntax has no regular expressions or
modifiers; an optional part is a group, `{/:id}`. Escape the character
(`\(`) to match it literally.

### Unexpected } at index N with no { open, escape it with a backslash to match it literally

A `}` closes nothing. Remove it, add the `{` it belongs to, or write `\}` to
match a brace.

### Unexpected end at index N, expected }

A `{` was never closed: `/a{/:id`. Add the `}`, or write `\{` to match a brace.

### Unterminated quote at index N

A quoted name without its closing quote: `/:"a-b`. Close it (`/:"a-b"`).

### Unexpected end after \ at index N

The pattern ends with a backslash, which escapes the next character. Remove it,
or write `\\` to match a backslash.

### Missing text before "<name>" param, put a literal character between two captures

Also `wildcard`, and `"*" wildcard` for a wildcard with no name. `/:a:b` has no
text to tell where `a` ends, and `/:a*` none to tell where it stops. Put a
literal between them (`/:a-:b`, `/:a/:b`, `/:a/*`).

### Too many path combinations, use fewer optional groups

More than 256 combinations of optional groups. Use fewer groups, or split the
route in two.

## Bun is not defined

`import { loadRules, filePolicyStore } from '@softistx/limix/bun'` loads
anywhere, but the first call throws `ReferenceError: Bun is not defined` in
Node, Deno, a browser or an edge runtime: the subpath reads files with
`Bun.file` and parses YAML with `Bun.YAML`, so it runs on Bun only. Elsewhere,
read the file yourself and pass the value to `parseRules`; keep the last good
remote copy with your own `PolicyStore`. A YAML file needs a parser you
install (or your runtime's own); limix ships none outside Bun:

```ts
import { readFile } from 'node:fs/promises'
import { parseRules } from '@softistx/limix'

// JSON needs no parser; for YAML, parse the text with the parser you installed.
const rules = parseRules(JSON.parse(await readFile('rules.json', 'utf8')), 'rules.json')
```

## Cannot find module '@softistx/limix/node' or its corresponding type declarations

Also the runtime's `Package subpath './node' is not defined by "exports" in …/node_modules/@softistx/limix/package.json`. The
`./node` subpath was renamed `./bun`, because it runs on Bun only. Import from
`@softistx/limix/bun` (Bun only; elsewhere see [Bun is not defined](#bun-is-not-defined)):

```ts
import { loadRules, filePolicyStore } from '@softistx/limix/bun'
```

## unsupported extension `<ext>`: use .yaml, .yml or .json

`loadRules` (`@softistx/limix/bun`, Bun only) picks the parser by file extension. Rename the file, or read it
yourself and pass the value to `parseRules`.

## not readable: <reason>

The file has the right extension but is not valid YAML or JSON; the reason is
the parser's. Fix the syntax.

## duplicate key "<key>" at line <n> (first at line <m>)

`loadRules` found `<key>` twice in one mapping of a YAML file (a `RulesError`
listing every repeat). A YAML parser would keep the last one and drop the
first, so a rule or a method you wrote could vanish without a trace. Delete or
merge the repeat:

```yaml
rest:
  /documents:
    GET: { roles: [[reader]] }
    GET: { public: true }   # line 4: duplicate, first at line 3
```

Keys are compared as Bun reads them: `a`, `"a"` and `'a'` are one key, so are `1` and `1.0`
or `null` and `~`, but `1.0` and `"1.0"` are two. A repeat inside a merge-key mapping, a
multi-line flow collection or after a complex key is not looked for (see
[rules.md](./rules.md#duplicate-keys-and-one-document)).

## a rules file holds one YAML document

The file has a `---` separator after its first document (or a `...` end marker
before another). The rules are one document: remove the separator, or split the
file in two and load each.

## ENOENT: no such file or directory, open '<path>'

`loadRules` throws the raw system error (`Bun.file`'s), not a `RulesError`, when the file is
missing (`ENOENT`) or unreadable (`EACCES`): the `RulesError` is for what the
file says, not for reaching it. Check the path (it is resolved from the
process's working directory) and the permissions, or catch the error where you
call `loadRules` (schematic: `rules` is yours):

```ts
try {
  rules = await loadRules('rules.yaml')
} catch (error) {
  if (error instanceof RulesError) /* the file is wrong */
  else /* the file could not be read */
  throw error
}
```

## auth.errors.unauthenticated

A refusal with status 401. The rule is not `public` and `claims.authenticated`
is not `true`; or no rule names the route and `global.unmatched` is `deny`. Pass `{ authenticated: true, subject: { type, id } }` for a signed-in caller, or
mark the rule `public: true`. `explain` shows which stage refused.

## auth.errors.forbidden

A refusal with status 403. The caller is signed in but `roles`, `permissions` or
a `when` condition failed, a `FORBIDDEN` relation rung refused, or no rule names
the route and `global.unmatched` is `deny`. Run `explain` with the same input:
the step with `passed: false` is the one. A `when` predicate that throws also
lands here; its message is in the step's `note`.

## auth.errors.forbidden, params.reason: no-subject

The rule declares `relations` and the caller is signed in
(`authenticated: true`) but carries no usable `claims.subject` (an object
whose `type` and `id` are non-empty strings), so there is nobody to ask the
relations about. The refusal is 403 with `params.reason: 'no-subject'`
(an anonymous caller is 401 first). Read the identity into the claims:

```ts
claims: { authenticated: true, subject: { type: 'user', id: userId } }
```

## auth.errors.not-found

A refusal with status 404. A relation rung that answers `NOT_FOUND` (the
default) failed: the caller does not hold the relation on the object, or the
`from` path resolved no id. Write `onDeny: FORBIDDEN` on the rung to answer 403
instead, or give the rung a `code` to change the code (under `auth.errors.`, so
`@softistx/alxia-access` reads it).

## limix.errors.unavailable

A refusal with status 503. `params.reason` says why.

- `no-policy`: the `PolicySource` you passed holds no policy yet (a
  `mutableSource()` nobody called `swap` on, or one that was withdrawn).
  Swap a compiled policy in; until then every request is refused.
- `no-relation-checker`: the matched rule declares `relations` and the call
  passed no `relations`. Pass your `RelationChecker`. `policy.usesRelations`
  tells at setup whether any rule needs one: throw there rather than answer 503
  per request.

`@softistx/alxia-access`'s `refusalOf` reads only codes under `auth.errors.` and
`tenancy.errors.`, so this one needs the mapping `@softistx/limix-alxia` does (503 with `retry-after`).

## `limix.errors.unavailable` with `params.reason: 'no-policy'`: the source holds no policy, every request is refused

A line a host logs through `outageReporter` (the package supplies no text) when a source is seen
holding none, including the first look before any policy arrived: the `mutableSource` was swapped to `null`, or
a remote source lost its rules. Every evaluator answers
`limix.errors.unavailable` (503, `params.reason: 'no-policy'`) until a policy is
swapped back, which re-arms the reporter.

## the error your RelationChecker threw

`evaluateRest`, `evaluateField` and `explain` do not catch a `RelationChecker`
that throws or rejects (the backend is down, a timeout): the evaluation rejects
with that same error, never with an allow or a refusal. Catch it where you call
the evaluator and answer with the status you choose (503 is usual); do not
treat it as a denial.

## evaluateRest: pass the `route` or the `path`

`evaluateRest` and `explain` were given neither. Pass the matched route pattern
as `route`, or the request pathname as `path`. A source that holds no
policy answers 503 before this check is reached.

## evaluateRest: pass the `claims`

`evaluateRest` and `explain` of a REST request were given no `claims`, or one that is not an object (a JS caller; the
types forbid it). A missing caller is not treated as anonymous: that would let a
forgotten argument read as "not signed in". Pass `claims: {}` for an anonymous
caller, or the verified claims.

```ts
await evaluateRest(policy, { method: 'GET', route: '/things', claims: {} })
```

## evaluateField: pass the `claims`

The same for `evaluateField` and `explain` of a GraphQL field: `claims` is
missing or not an object, and it throws before anything is evaluated. Pass
`claims: {}` for an anonymous caller.

## limix: the RelationChecker answered N for M queries; it must return one boolean per query, in order

Your `RelationChecker.check` returned an array of another length than the
`queries` it received. The variant `answered nothing for M queries` is a result
that is not an array at all (`undefined`, an object): return the array. Return exactly `queries.map(...)`, one boolean per query
in the same order; a backend that dedupes must expand its answers back.

## policySource: `current` and `subscribe` must both be functions

`policySource({ current, subscribe })` was given an object missing one of them.
Both are functions: `current()` returns the compiled policy or `null`,
`subscribe(listener)` returns the unsubscribe function. For a fixed or
hand-swapped policy use `staticSource` or `mutableSource`.

## coverage: operation <n> must be { kind: 'rest', method, path } or { kind: 'graphql', type, field, root }

`coverage` was given an entry that is not an `Operation`: a string such as
`'GET /things'` (the list is objects now), a REST entry without `method` or
`path`, or a GraphQL one without `type`, `field` or a boolean `root`. `<n>` is
its index in your list.

```ts
coverage(policy, [
  { kind: 'rest', method: 'GET', path: '/things/:id' },
  { kind: 'graphql', type: 'Query', field: 'me', root: true },
])
```

## coverage: `operations` must be an array

`coverage(policy, operations)` was given something other than an array: the
list is the second argument, and `undefined` (a list an integration failed to
build), a single operation or an object is refused before anything is read.

```ts
coverage(policy, [{ kind: 'rest', method: 'GET', path: '/things/:id' }])
```

## a public rule is refused: an earlier pattern takes its path (`shadowedBy`)

A rule written after another that takes the same path never applies: the walk
is in document order, for a `path` and a `route` alike.

```yaml
rest:
  /notes/:id:
    GET: { authenticated: true }
  /notes/new:
    GET: { public: true }      # GET /notes/new answers 401: /notes/:id took it
```

Coverage shows `GET /notes/new` as `covered` and lists the rule in `stale` with
`shadowedBy: { path: '/notes/:id', label: 'GET /notes/:id' }`. Move the static
pattern before the param or wildcard one.

## an operation is reported `match: 'pattern'`

Not an error: a rule's matcher takes this spelling of the path, not its own
pattern, as `evaluateRest` does for a request with that path, or an earlier
rule's matcher took it (see `shadowedBy` above). That is all it
guarantees: an operation with a wildcard (`/files/*path`) or an optional group
with a parameter is never covered this way, and shows `uncovered` unless a rule
spells it exactly. The operation's `path`
is spelled another way than the rule (`/things/{id}` or `/things/:thingId`
against `/things/:id`). Spell it as the rules file does (`rulesPathOf` from
`@softistx/limix/coverage` converts an OpenAPI path), or gate the build on
`summary.byPattern` to keep the spellings in line. The rule is used, never
stale.

## `loadRules` is not exported by `@softistx/limix`

`loadRules` moved to `@softistx/limix/bun`: it reads the disk with `Bun.file`,
and the main entry imports no `node:` or Bun API so it runs in a browser or an edge
runtime. Change the import:

```ts
import { loadRules } from '@softistx/limix/bun'
```

## remotePolicy: give `jwksUri`, `issuer`, or both

`remotePolicy` has to know where the keys come from. Pass `jwksUri` (the key
set's URL), `issuer` (the key set's URL is discovered from its
`/.well-known/openid-configuration`), or both:

```ts
import { remotePolicy } from '@softistx/limix/remote'

remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  jwksUri: 'https://policy.example.com/jwks',
})
```

## remotePolicy: `rulesUrl` must be https (http only for localhost, 127.0.0.1 or ::1), got <scheme>//<host>

`rulesUrl`, `jwksUri` and `issuer` (and a `jwks_uri` found by discovery) must be
`https:`: the rules decide who may do what, so a cleartext pull is refused. Use
`https`, or `http` against `localhost` in development. The name in the message
is the option.

## remotePolicy: `timeoutMs` must be an integer from 1 to 2147483647, got <value>

`timeoutMs` and `intervalMs` take whole milliseconds, above 0 and at most
2147483647 (a larger timer delay overflows to 1 ms). The name in the message is
the option. See also the entry for `maxStaleMs` below.

## remotePolicy: `maxStaleMs` must be a number above 0 (or Infinity), got <v>

`maxStaleMs` is how many milliseconds past its `exp` a copy still serves. Give a
number above 0, or `Infinity` to never refuse; `0`, a negative number, `NaN` and
a string are refused at construction rather than failing open. The error is a
`RemotePolicyConfigError`:

```ts
import { RemotePolicyConfigError, remotePolicy } from '@softistx/limix/remote'

try {
  remotePolicy({
    rulesUrl: 'https://policy.example.com/rules',
    audience: 'billing-api',
    jwksUri: 'https://policy.example.com/jwks',
    maxStaleMs: 0,
  })
} catch (error) {
  if (error instanceof RemotePolicyConfigError) console.error(error.message)
}
```

Every `RemotePolicyError` below reaches `onError` (and the logger) with the
message shown in its heading; its `code` is the second column of the table in
[remote rules](remote.md#options). The last good copy keeps serving after each
of them unless the entry says otherwise.

## signature verification failed

`RemotePolicyError` with code `SIGNATURE`: the token's signature does not match
the key it names. Either it was tampered with, or the publisher signed with a
key that is not the one listed at `jwksUri`. Check that the key set you pull is
the publisher's current one.

## no applicable key found in the JSON Web Key Set

`SIGNATURE`: no key of the set fits the token's `kid` and `alg`. When the key
set's URL was discovered, the source discovers again once before refusing, in
case the issuer moved it. Otherwise the publisher signed with a key it has not
published yet (publish the new key first, then sign with it), or `jwksUri`
points at the wrong set.

## Invalid Compact JWS

`SIGNATURE`: the body is not a compact JWS (three dot-separated parts), for
instance an HTML error page served with a 200, a JSON document, or a token cut
short. An algorithm outside RS256, PS256, ES256 and EdDSA is refused as
`SIGNATURE` too, HS256 included, even when the key set advertises an `oct` key.
Open `rulesUrl` and check it returns the token alone.

## could not reach <url>: <reason>

`FETCH_FAILED`: the request never got an answer (network down, DNS, a TLS
error, a timeout after `timeoutMs`). The reason follows the colon. Check the
URL and the network; the next tick retries.

## the token function threw

`FETCH_FAILED`: the `authToken` function threw, rejected or outlived
`timeoutMs`, so no request was made. The original error is the `cause`.

## <url> answered a redirect, which is refused so the bearer token is never sent elsewhere

`FETCH_FAILED`: the policy server, the issuer's discovery document or the key
set answered with a redirect, and the runtime refused to follow it. Pulls are
made with `redirect: 'error'`, so `Authorization: Bearer <authToken>` can never
follow a redirect to another origin or to `http:`. Point `rulesUrl`, `jwksUri`
and `issuer` at the final URLs.

## <url> answered <status>, a redirect, which is refused so the bearer token is never sent elsewhere

`HTTP_STATUS`: the same refusal, when the runtime hands back the 3xx (for
example `https://pub.example/rules answered 302, a redirect, ...`) instead of
failing the fetch. The policy never follows it, so
`Authorization: Bearer <authToken>` stays on the origin you configured. Point
`rulesUrl` at the final URL.

## <url> answered <status>

`HTTP_STATUS`: the policy server answered something other than 200 or 304. 401
and 403: check `authToken`. 404: check `rulesUrl`. 5xx: the publisher is down;
the last good copy keeps serving. A 3xx is a redirect, which is refused (see
the two headings above).

## <url> answered 304 to a request without If-None-Match

`HTTP_STATUS`: the server said "not modified" when the pull had no ETag to
compare, which is the case while the held copy came from the store and is still
provisional, or when none is held. A 304 confirms nothing then, so it is
refused and the copy is re-verified on the next pull. Make the server answer 304
only to a request that carries `If-None-Match`.

## <url> has no jwks_uri

`FETCH_FAILED` (the message starts with `discovery failed: `): the issuer's
`/.well-known/openid-configuration` document has no `jwks_uri`. Add it, or pass
`jwksUri` and skip discovery. The same prefix carries the other discovery
faults: `<url> answered <status>`, and
`<url> names issuer <other>, not <issuer>` when the document names another
issuer than the `issuer` option.

## `iat` is required

`CLAIMS`: the token has no numeric `iat`. Both `iat` and `exp` are required.

## `ver` must be a positive integer

`CLAIMS`: the `ver` claim is missing, not an integer or below 1.

## `rules` must be an object

`CLAIMS`: the `rules` claim is missing or not a JSON object.

## unexpected "typ" JWT header value

`CLAIMS`: the token's `typ` header is not the `typ` option (default
`limix-rules+jwt`). A `rules+jwt` token is refused. Align the publisher or the
option; `DEFAULT_TYP` is exported from `@softistx/limix/remote`.

## unexpected "aud" claim value

`CLAIMS`: the token's `aud` does not contain the `audience` option. Set
`audience` to what the publisher signs.

## unexpected "iss" claim value

`CLAIMS`: `issuer` is set and the token's `iss` differs. Set `issuer` to what
the publisher signs, or leave it out and give `jwksUri` alone.

## "exp" claim timestamp check failed

`CLAIMS`: the token is expired. `missing required "exp" claim` is the same
refusal for a token with no `exp`. Both `iat` and `exp` are required; check the
publisher's clock and the token's lifetime.

## "nbf" claim timestamp check failed

`CLAIMS`: the token's `nbf` (not before) is later than this machine's clock on a
live pull. Check both clocks; the next pull retries.

## "nbf" claim is in the future

`CLAIMS`: the same for a stored copy read at start, whose `nbf` is later than
the clock. It is reported as `the stored policy was not used: "nbf" claim is in
the future` and ignored.

## "iat" claim timestamp check failed

`CLAIMS`: the token's `iat` is later than this machine's clock. The publisher's
clock is ahead, or yours is behind. Fix the skew.

## `schema` is <value>, this build reads the rules format 1

`CLAIMS`: the publisher wrote a `schema` claim other than the number
`LIMIX_FORMAT_VERSION` (`1`); a string such as `'v1'` is refused. Upgrade
`@softistx/limix`, or publish format 1. Leave `schema` out to skip the check.

## ver <n> is already held with different rules: the publisher must bump ver

`CLAIMS`: the same `ver` carried other rules than the held copy. Bump `ver`
whenever the rules change; a re-signing of identical rules is accepted.

## ver <n> was held with different rules before its withdrawal: the publisher must bump ver

`CLAIMS`: the held copy expired and was withdrawn, and the token now served is
at the same `ver` as the highest one accepted live but carries other rules. The
floor remembers the rules that set it. Bump `ver`.

## ver <n> is lower than the held ver <m>

`STALE_VERSION`: a rollback. The pulled token's `ver` is below the held one (or
below the highest `ver` ever accepted live, which survives a withdrawal). The
publisher served an older document, or its `ver` went down. Publish a higher
`ver`; the held rules keep serving.

## Invalid rules in the pulled rules: N issues

`RULES_REFUSED`: the token verified, but its `rules` claim failed `parseRules` or
`compilePolicy`: a `RulesError`, with one line per issue as in
[Invalid rules](#invalid-rules-n-issues). The first line says "in the pulled
rules" whichever step refused. A `when` naming a condition the service did not
register arrives here as `unknown condition <name>`: add it to the `conditions`
option.

## the stored policy was not used: <reason>

`STORE`: the store could not be read, or its copy is not valid for the options.
`<reason>` is the cause: a read error, a hung `store.read()` bounded by
`timeoutMs`, `<path> is not a stored policy` from `filePolicyStore`, a token that
fails any check above (wrong `audience`, `typ`, a signature the stored key set
does not verify). The service starts with nothing held until the first pull.

## <path> is not a stored policy

`filePolicyStore` read a file that is not JSON of the shape `{ jws, jwks, etag? }`.
It is reported as `the stored policy was not used: <path> is not a stored policy`
and ignored; the next accepted pull overwrites it. Delete the file if something
else wrote it, and keep the path to this store alone.

## could not write the policy store: <reason>

`STORE`: `store.write` failed or outlived `timeoutMs` after an accepted policy.
The policy still serves; only a restart would lack it. Check the file's folder
and rights, or the store's connection.

## the stored key set holds a key that is not in trustedKeys

`STORE`: `trustedKeys` is set and the stored key set holds a key whose JWK
thumbprint (RFC 7638) is not listed, so the copy is ignored. Add the thumbprint
(a warning names it when the live key set holds an unlisted key) or clear the
stored copy. `trustedKeys` only pins what a stored copy may carry; live pulls
are verified against the publisher's key set.

## the stored policy was issued in the future

`STORE`: the stored token's `iat` is more than 60 s ahead of this machine's
clock. The clock was wrong when it was stored or is now; the copy is ignored.

## the stored policy is <n>s past its expiry, beyond maxStaleMs

`STORE`: the stored copy expired more than `maxStaleMs` ago, so it is not
served at start. Raise `maxStaleMs` only if serving older rules is acceptable;
otherwise wait for the first pull.

## the stored policy is refused by the live keys: <reason>

`STORE`: the stored copy served provisionally, then the live key set refused it
(`<reason>` is the refusal, e.g. `signature verification failed`). It is dropped,
so the service holds nothing until a pull succeeds. The store held a token the
publisher's keys do not vouch for, or keys rotated while the service was down.

## the held policy is <n>s past its expiry, beyond maxStaleMs: withdrawn

`EXPIRED`: the publisher has been away so long that the held copy is more than
`maxStaleMs` (default 24 h) past its `exp`. The source withdraws it: subscribers
hear `null` and every request is refused with `limix.errors.unavailable` until a
pull succeeds. Restore the publisher; raise `maxStaleMs` only if serving older
rules is acceptable.

## <url> is larger than 1048576 bytes

`TOO_LARGE`: the rules, key set or discovery response is over 1 MiB and was
refused before being read whole. Split the rules, or check the URL does not
point at something else.

## Handling a `RemotePolicyError`

Every failure above is a `RemotePolicyError` whose `code` is one of the codes
named in the entries; match on the class and the code, not the message:

```ts
import { remotePolicy } from '@softistx/limix/remote'

// Schematic: `alertSecurity` stands for your own code.
declare function alertSecurity(message: string): void

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  jwksUri: 'https://policy.example.com/jwks',
  onError: (error) => {
    if (error.code === 'SIGNATURE') alertSecurity(error.message)
  },
})
```

## Module '"@softistx/limix/remote"' has no exported member 'filePolicyStore'

TypeScript's text for `import { filePolicyStore } from '@softistx/limix/remote'`.
The file store reads the disk with Bun's file API, so it lives on
`@softistx/limix/bun`; `remote` stays free of Node and Bun:

```ts
import { filePolicyStore } from '@softistx/limix/bun'
```
