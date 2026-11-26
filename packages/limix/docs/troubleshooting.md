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

## invalid path pattern: <reason>

At `rest['<pattern>']`: the path-to-regexp pattern does not parse (an unnamed
`:`, an unclosed `(`). The reason is the library's, with the index of the
character. `compilePolicy` skips that route and reports every bad pattern with
the other issues, so fix them together.

## unsupported extension `<ext>`: use .yaml, .yml or .json

`loadRules` (`@softistx/limix/node`) picks the parser by file extension. Rename the file, or read it
yourself and pass the value to `parseRules`.

## not readable: <reason>

The file has the right extension but is not valid YAML or JSON; the reason is
the parser's. Fix the syntax.

## ENOENT: no such file or directory, open '<path>'

`loadRules` throws the raw `node:fs` error, not a `RulesError`, when the file is
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
`tenancy.errors.`, so this one needs the alxia integration's own mapping.

## Policy source unavailable (limix.errors.unavailable): it holds no policy, every request is refused

The line `outageReporter` reports (`OUTAGE_MESSAGE`) when a source is seen
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

## an operation is reported `match: 'pattern'`

Not an error: a rule's matcher takes this spelling of the path, not its own
pattern, as `evaluateRest` does for a request with that path. That is all it
guarantees: an operation with a wildcard (`/files/*path`) or an optional group
with a parameter is never covered this way, and shows `uncovered` unless a rule
spells it exactly. The operation's `path`
is spelled another way than the rule (`/things/{id}` or `/things/:thingId`
against `/things/:id`). Spell it as the rules file does (`rulesPathOf` from
`@softistx/limix/coverage` converts an OpenAPI path), or gate the build on
`summary.byPattern` to keep the spellings in line. The rule is used, never
stale.

## `loadRules` is not exported by `@softistx/limix`

`loadRules` moved to `@softistx/limix/node`: it reads the disk with `node:fs`,
and the main entry imports no `node:` module so it runs in a browser or an edge
runtime. Change the import:

```ts
import { loadRules } from '@softistx/limix/node'
```

## remotePolicy: give `jwksUri`, `issuer`, or both

`remotePolicy` has to know where the keys come from. Pass `jwksUri` (the key
set's URL), `issuer` (the key set's URL is discovered from its
`/.well-known/openid-configuration`), or both:

```ts
remotePolicy({ rulesUrl, audience, jwksUri: 'https://policy.example.com/jwks' })
```

## remotePolicy: `rulesUrl` must be https (http only for localhost, 127.0.0.1 or ::1), got <scheme>//<host>

`rulesUrl`, `jwksUri` and `issuer` (and a `jwks_uri` found by discovery) must be
`https:`: the rules decide who may do what, so a cleartext pull is refused. Use
`https`, or `http` against `localhost` in development. The name in the message
is the option.

## remotePolicy: `timeoutMs` must be an integer from 1 to 2147483647, got <value>

`timeoutMs` and `intervalMs` take whole milliseconds, above 0 and at most
2147483647 (a larger timer delay overflows to 1 ms).
`maxStaleMs` must be a number above 0, or `Infinity` to never refuse; `0`, a
negative number and `NaN` are refused rather than failing open.

## FETCH_FAILED

A `RemotePolicyError` with this `code`: the pull never got an answer (network
down, DNS, a timeout after `timeoutMs`, the `authToken` function threw, the
issuer's discovery document names another issuer or has no `jwks_uri`). The last
good copy keeps serving. Check the URL, the network and `timeoutMs`; the next
tick retries.

## HTTP_STATUS: `<url>` answered <status>

The policy server answered something other than 200 or 304 (or a 304 to a
request that had no `If-None-Match`). The last good copy keeps serving. 401 and
403: check `authToken`.

## SIGNATURE

The token was refused as a token: a bad or tampered signature, a key the key set
does not hold, a malformed body, or an algorithm outside RS256, PS256, ES256 and
EdDSA (HS256 is refused even when the key set advertises an `oct` key). Check
that the publisher signs with a key listed at `jwksUri`.

## CLAIMS: `typ`, `aud`, `iss`, `exp` and `schema`

`CLAIMS` is a token that is signed but not acceptable. The message names the
claim:

- `unexpected "typ" JWT header value`: the token's `typ` is not the `typ`
  option (default `limix-rules+jwt`). Align the publisher or the option.
- `unexpected "aud" claim value` or `unexpected "iss" claim value`: set
  `audience` and `issuer` to what the publisher signs.
- `"exp" claim timestamp check failed`, or `missing required "exp" claim`:
  the token is expired, or has no `exp`; `iat` and `exp` are both required.
- `` `schema` is <value>, this build reads the rules format 1 ``: the publisher
  wrote another format version than `LIMIX_FORMAT_VERSION`. Upgrade
  `@softistx/limix`, or publish format 1. Leave `schema` out to skip the check.
- `` `ver` must be a positive integer `` and `` `rules` must be an object ``.
- `ver <n> is already held with different rules: the publisher must bump ver`:
  the same `ver` carried other rules. Bump `ver` whenever the rules change.

The last good copy keeps serving.

## STALE_VERSION: ver <n> is lower than the held ver <m>

A rollback: the pulled token's `ver` is below the held one (or below the highest
`ver` ever accepted live, which survives a withdrawal). The publisher served an
older document, or its `ver` went down. Publish a higher `ver`; the held rules
keep serving.

## RULES_REFUSED: Invalid rules in the pulled rules: N issues

The token verified, but its `rules` claim failed `parseRules` or
`compilePolicy`: a `RulesError`, with one line per issue as in
[Invalid rules](#invalid-rules-n-issues). The last good copy keeps serving. A
`when` naming a condition the service did not register arrives here as
`unknown condition <name>`: add it to the `conditions` option.

## STORE

The `store` failed, and serving goes on without it: the stored copy was
unreadable, not valid for the options (`the stored policy was not used: ...`),
holds a key not in `trustedKeys`, was issued in the future, is beyond
`maxStaleMs` past its expiry, or is refused by the live keys; or a write
failed or outlived `timeoutMs` (`could not write the policy store: ...`). A hung
`store.read()` is bounded by `timeoutMs`. Check the file's folder and rights.

## EXPIRED: the held policy is <n>s past its expiry, beyond maxStaleMs: withdrawn

The publisher has been away so long that the held copy is more than `maxStaleMs`
(default 24 h) past its `exp`. The source withdraws it: subscribers hear `null`
and every request is refused with `limix.errors.unavailable` until a pull
succeeds. Restore the publisher; raise `maxStaleMs` only if serving older rules
is acceptable.

## TOO_LARGE: `<url>` is larger than 1048576 bytes

The rules, key set or discovery response is over 1 MiB and was refused before
being read whole. Split the rules, or check the URL does not point at something
else.

## `filePolicyStore` is not exported by `@softistx/limix/remote`

The file store reads the disk with `node:fs`, so it lives on
`@softistx/limix/node`; `remote` stays free of Node:

```ts
import { filePolicyStore } from '@softistx/limix/node'
```
