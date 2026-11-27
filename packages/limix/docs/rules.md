# Rules

A rules document says who may reach each REST route and each GraphQL field. You
write it as YAML or JSON, or in code with `definePolicy`; both give the same
structure, validated the same way.

```yaml
# yaml-language-server: $schema=node_modules/@softistx/limix/schema/rules.schema.json
limix: 1
global:
  unmatched: deny
rest:
  /documents/:id:
    PUT:
      permissions: [[documents:write]]
graphql:
  Mutation:
    publishDocument:
      roles: [[editor], [admin]]
```

```ts
import { definePolicy } from '@softistx/limix'

export const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/documents/:id': { PUT: { permissions: [['documents:write']] } } },
  graphql: { Mutation: { publishDocument: { roles: [['editor'], ['admin']] } } },
})
```

## Reading and checking rules

| Function | What it does |
| --- | --- |
| `parseRules(input)` | Validates a value, returns `Rules`, throws a `RulesError` listing every issue with its path |
| `loadRules(path)` from `@softistx/limix/bun` | Reads a `.yaml`, `.yml` or `.json` file, then `parseRules` |
| `definePolicy(rules)` | Writes the document in code: the identity at run time, a compile error on a typo |
| `compilePolicy(rules, { conditions })` | Precompiles the route table and the field table into a `CompiledPolicy` |

```ts
import { compilePolicy } from '@softistx/limix'
import { loadRules } from '@softistx/limix/bun'

const rules = await loadRules('rules.yaml')
const policy = compilePolicy(rules, {
  conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
})
```

To validate a value you already hold, an object or the result of parsing YAML
or JSON yourself, call `parseRules`:

```ts
import { parseRules } from '@softistx/limix'

// Bun shown; elsewhere read the file and use your runtime's YAML or JSON parser.
const rules = parseRules(Bun.YAML.parse(await Bun.file('rules.yaml').text()), 'rules.yaml')
```

The second argument is only the name the error message shows.

### Duplicate keys and one document

`loadRules` refuses a YAML file that writes a key twice in one mapping, where
`Bun.YAML.parse` alone would keep the last one without a word. The error lists
every repeat, with the line of each and of the first:

```
Invalid rules in rules.yaml: 1 issue
  (document): duplicate key "GET" at line 9 (first at line 5)
```

A file holding several YAML documents (`---` after content) is refused too:
`a rules file holds one YAML document`.

The check is a small scanner of its own, run on the text before parsing, and it
aims never to refuse a valid file: what it does not read it skips instead of
guessing. It reads block mappings by indentation, block sequences (`- key:`
opens a mapping), plain, single-quoted and double-quoted keys, comments, block
scalars (their content is skipped), anchors, aliases and tags, and flow
mappings on one line (`{ a: 1, b: 2 }`). Keys are compared as Bun reads them
(`String(Bun.YAML.parse(key))`): `a`, `"a"` and `'a'` are one key, so are `1`
and `1.0`, `null` and `~`, `"\x41"` and `A`; `1.0` and `"1.0"`, or `~` and
`"~"`, are two. A key Bun cannot read alone skips its mapping.

A repeat is not caught in these places, write keys once there too:

- a mapping with a merge key `<<` (Bun applies merges) or an alias used as a key;
- a flow collection over several lines, and its mapping (an unclosed quote inside one stops the check);
- anything after a complex key (`? key`), which stops the check at that line;
- a root block scalar (`--- |`) is skipped to the end of the file, a `---` inside it included;
- a flow collection used as a key.

Other things to know:

- `---` then `---` then content counts as one document, and the empty-document
  array Bun returns is refused by `parseRules`, not by this check.
- A file that is not valid YAML may get the duplicate message first; fix that
  one and the syntax error follows.

`parseRules` on a value you parsed yourself cannot see duplicates, the parser
has already dropped them.

A `RulesError` lists every issue, not the first:

```
Invalid rules in rules.yaml: 2 issues
  global.unmatched: Invalid option: expected one of "allow"|"deny"
  rest['/documents'].GET.keto: `keto` is removed: use relations
```

The path of an issue is the key as you wrote it: `rest['GET /documents']` for a
flat key, `rest['/documents'].GET` for a nested one.

`error.issues` holds the same as `{ path, message }` pairs.

## The document

`Rules` is an explicit, hand-written type. A test holds it mutually assignable
with the schema's inference, so the type you import does not move with a release
of the validation library.

| Key | Meaning |
| --- | --- |
| `limix` | The format version. Always `1`. Required |
| `global` | Settings for the whole document. Required |
| `rest` | Rules by `METHOD /pattern`, or by path pattern then HTTP method |
| `graphql` | Rules by `Type.field`, or by type name then field name |
| `x-...` | Free keys for YAML anchors; dropped when parsing |

Any other top-level key throws.

### `global`

- `unmatched` (required): `allow` or `deny`. What a REST path, or a GraphQL root
  field, that no rule names is answered. `deny` makes the file the exhaustive
  list of what the service exposes. It is required so that leaving a door open
  is written down.
- `basePath`: a prefix put before every REST pattern, e.g. `/api`.

### REST rules

A key under `rest` is written in one of two spellings, and a document may mix
them freely:

- **Flat**: a method, one space, the path pattern. The value is the rule.
- **Nested**: the path pattern. The value is keyed by method.

```yaml
rest:
  # flat: one rule per key
  GET /documents:
    authenticated: true
  POST /documents/:id:
    permissions: [[documents:write]]
  # nested: several methods under one path
  /documents/:id:
    GET:
      authenticated: true
    DELETE:
      roles: [[admin]]
```

```ts
definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    'GET /documents': { authenticated: true },
    'POST /documents/:id': { permissions: [['documents:write']] },
    '/documents/:id': {
      GET: { authenticated: true },
      DELETE: { roles: [['admin']] },
    },
  },
})
```

The two spellings mean the same thing, so choose by what reads best: flat for a
route with one method, nested to keep the methods of a path together.

The methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`,
`CONNECT`, `TRACE` and `QUERY`, and `*` for any (below). A flat key is split at
its first space, so `GET /a b` is the method `GET` on the pattern `/a b`. A key
that looks flat and is not one (`get /x`, `GET  /x` with two spaces,
`PROPFIND /x`) is refused with a message, rather than read as a path that holds
a space.

**Document order.** Every rule keeps the place of its key in the document, flat
and nested alike, and the first rule whose pattern matches, in document order, is
used, for a `route` and a `path` alike: write static patterns before the param or
wildcard ones that take them. Coverage reports a rule that never applies as stale
with `shadowedBy`.

```yaml
rest:
  GET /notes/new:        # first: /notes/new is judged here
    public: true
  /notes/:id:
    GET:
      authenticated: true
```

**No duplicates.** Two keys that name the same rule are a compile error that
names both, wherever they are and whichever spelling they use:

```
duplicate rule: rest['POST /users/:id'] and rest['/users/:id'].POST both name POST /users/:id
```

One trailing `/` does not make a pattern different (`/a/` is `/a`). Different
parameter names (`/a/:id` and `/a/:uid`) are not a duplicate but shadowing:
the first takes every path of the second, and coverage reports the second as
stale.

#### Path patterns

| Write | It takes |
| --- | --- |
| `/users` | exactly that path; one trailing `/` is optional and case is ignored |
| `/users/:id` | one segment, captured as `id` and percent-decoded |
| `/users/:"user-id"` | the same, for a name that is not an identifier |
| `/files/*path` | the rest of the path, slashes included, captured as the list `path` |
| `/files/*` | the same with no name: nothing is captured, so no `param.` term can read it |
| `/things{/:id}` | an optional part: `/things` and `/things/7` |
| `/a\:b` | a backslash makes the next character literal: the path `/a:b` |

A pattern that does not parse (`/a(`, `/a/:`) is reported with the index of the
character; see [troubleshooting](troubleshooting.md#invalid-path-pattern-reason).
A `*` in the middle of a segment (`/a*`) takes the rest of the path from there.

#### Any method: `*`

The method `*` stands for every method. Write it flat (`* /admin/*`) or under a
path (`/admin/*: { "*": ... }`).

```yaml
rest:
  "* /admin/*":
    roles: [[admin]]
  GET /admin/health:     # a rule of another key written first still wins
    public: true
```

- A method has its own rules, and the `*` rules are among them, each in its own
  place in document order: `POST /admin/x` meets the first rule, in document
  order, that is for `POST` or for `*` and whose pattern takes the path.
- An exact method beats `*` **on the same pattern**, wherever each is written:
  with `GET /files/:id` and `* /files/:id`, `GET` meets the first and any other
  method the second. On a different pattern the document order decides, as for
  any two rules.
- `HEAD` faces its own rules and then the `GET` ones, as always; a `*` rule that
  both lists reach is judged once.
- `*` includes `OPTIONS` and `HEAD`. An authenticated `*` rule therefore
  refuses a CORS preflight, which carries no credentials. Give the same pattern
  an `OPTIONS` rule of its own, which beats the `*` on that pattern:

  ```yaml
  rest:
    "* /api/*":
      authenticated: true
    OPTIONS /api/*:
      public: true
  ```

- A method outside the list above (WebDAV's `PROPFIND`, for example) is judged by
  the `*` rules alone.

#### Writing the keys in YAML

An unquoted `*` is a YAML alias. Quote a key that starts with it, and a method
`*` under a path:

```yaml
rest:
  "* /admin/*":          # quoted: a key starting with *
    roles: [[admin]]
  /files/*:              # fine: the star is not first
    "*":                 # quoted: the method *
      authenticated: true
```

A flat key holds a space and a path, which YAML reads as a plain key when it
starts with a method (`GET /a: ...`); quote it when you want to be safe.

### GraphQL rules

A key under `graphql` is written in one of two spellings, which a document may
mix:

- **Flat**: `Type.field`, or `Type.*` for every field of the type. The value is
  the rule.
- **Nested**: the type name. The value is keyed by field name.

```yaml
graphql:
  Query.me:
    authenticated: true
  Mutation:
    publishDocument:
      roles: [[editor], [admin]]
    archiveDocument:
      roles: [[admin]]
```

`Query`, `Mutation` and `Subscription` cover root fields; any other type name
guards fields of that type. A name that holds a dot is read as flat (a GraphQL
name never holds one): `Query.a.b` is refused, so is `*.me`, since a wildcard
names fields and not types.

A repeated `Type.field`, in either spelling, is a duplicate rule error naming
both keys.

#### Every field: `Type.*`

`Type.*` is the rule of every field of the type that has no rule of its own; an
exact field wins, wherever it is written:

```yaml
graphql:
  Note.*:                # every field of Note...
    authenticated: true
  Note.id:               # ...but id, which is public
    public: true
  Query.*:
    roles: [[admin]]     # every root query field
```

- Under `Query.*` every query field has a rule, so none falls to
  `global.unmatched`; `Query.*` is how a file says "the whole root, same rule".
- A `Note.*` on a non-root type guards every `Note` field wherever a `Note`
  appears, a list of notes included. It is evaluated once for each field the
  request selects, so it costs one evaluation per field and per object.
- With `@softistx/limix-graxia`, a static policy under `nonNull: 'refuse'`
  refuses a wildcard that covers a non-null field; see its
  [guide](https://github.com/softistx/limix/blob/develop/packages/limix-graxia/docs/graphql.md#the-non-null-rule).

## Terms of a rule

A rule may carry any of these. Every list of alternatives is in disjunctive
normal form: the outer list is OR, each inner list is AND.

### `roles`

`[['admin'], ['editor', 'reviewer']]` reads "admin, or editor and reviewer". A
role holds when it is in `claims.roles`.

```yaml
roles: [[admin], [editor, reviewer]]
```

```ts
{ roles: [['admin'], ['editor', 'reviewer']] }
```

### `permissions`

Same nesting as `roles`. A permission holds when it is a token of
`claims.scope` (space separated) and, when the caller carries
`claims.permissions`, is also in that list; a `permissions` claim that is not a
list holds nothing.

```yaml
permissions: [[documents:write], [documents:admin, audit:read]]
```

```ts
{ permissions: [['documents:write'], ['documents:admin', 'audit:read']] }
```

An empty list or an empty alternative is refused.

A role name carries no `$`: the `$domain` placeholder of `@softistx/security`
(a role per tenant) is refused with a hint.

### `relations`

Per-object checks, answered later through a relations port. The value is a list
of rungs, checked in order; the first that fails denies. Each rung has:

- `require`: alternatives of terms, same nesting as `roles`. A term is
  `{ relation, type, from }`: the caller must hold `relation` on an object of
  `type`, whose id is read from `from`.
- `onDeny`: `NOT_FOUND` (the default) or `FORBIDDEN`.
- `code`: the refusal's code, in place of the default one of the answer
  (`auth.errors.not-found`, `auth.errors.forbidden`). Put a custom code under
  `auth.errors.`: `@softistx/alxia-access` reads no other prefix (but
  `tenancy.errors.`).

`from` is `param.<name>`, `query.<name>` or `json.<path>` on REST, and
`args.<path>` or `source.<path>` on GraphQL. The other transport's spelling is
refused. When absent it is `param.id` on REST and
`args.id` on GraphQL. A REST `param.<name>` must be a
parameter the route's pattern captures, default included: `compilePolicy`
refuses the rest. An absent `onDeny` is
`NOT_FOUND`. These defaults belong to the rules format (`limix: 1`), so the
package exports no constant for them.

The caller is the subject of every check, as `{ type, id }` like in janus; it
comes from the request when rules are evaluated, so a rule names the object
only.

```yaml
relations:
  - require: [[{ relation: view, type: document, from: param.id }]]
  - require: [[{ relation: edit, type: document, from: param.id }]]
    onDeny: FORBIDDEN
```

```ts
{
  relations: [
    { require: [[{ relation: 'view', type: 'document', from: 'param.id' }]] },
    {
      require: [[{ relation: 'edit', type: 'document', from: 'param.id' }]],
      onDeny: 'FORBIDDEN',
    },
  ],
}
```

A stranger gets 404 on the first rung, a viewer who tries to write gets 403 on
the second.

### `when`

A list of condition names; every one must hold. A condition is a function you
register in code, so a rules file, which may come from elsewhere, carries no
code.

```yaml
when: [workingHours]
```

```ts
const policy = compilePolicy(rules, {
  conditions: {
    workingHours: ({ claims }) => claims['shift'] === 'day',
  },
})
```

A condition receives `{ claims, request, args, source, info }` (REST fills
`request` and `info`; GraphQL fills `args`, `source` and `info`) and returns a boolean or a promise of one.
A name that is not registered throws at `compilePolicy`.

### `authenticated` and `public`

`authenticated: true` says the rule needs a signed-in caller and nothing more.
`public: true` lets anonymous callers through. They cannot be combined. `public`
admits every caller, so it cannot be combined with `roles`, `permissions`,
`when` or `relations` either, which would narrow who may reach the rule:
`compilePolicy` throws, on REST and GraphQL alike.

## Typed operations and names

`definePolicy` and `compilePolicy` read a `Register` interface that a generated
file fills, so a typo in a path, a method, a GraphQL type or field in a
`definePolicy` literal, or a name in the `conditions` map, fails to compile. [`@softistx/limix-codegen`](../../limix-codegen/docs/codegen.md)
writes that file from the API's OpenAPI document and GraphQL schema and from the
rules file:

```ts
// src/generated/limix.ts (generated)
declare module '@softistx/limix' {
  interface Register {
    rest: 'GET /notes' | 'GET /notes/:id'
    graphql: 'Query.me'
    permission: 'notes:read'
    role: 'admin'
    condition: 'workingHours'
  }
}
```

```ts
definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  // error: `/notez` is not an operation of the API
  rest: { '/notez': { GET: { authenticated: true } } },
})
```

`Permission`, `Role`, `ConditionName`, `RestOperationName` and
`GraphqlOperationName` give the registered unions to your own code, and
`TypedRules` and `ConditionMap` are what `definePolicy` and the `conditions`
option of `compilePolicy` take. Nothing is registered by default: until a
generated file is in your program, every type is what it was (`string`, `Rules`).

What is checked, and what is not:

- A refusal holds only in an inline object literal given to `definePolicy`. A
  variable, a spread, an escaped `\*` key or a `{` key is accepted unchecked, and
  so is a key with a wildcard or a `{...}` group, which names several routes.
- Flat keys (`"GET /notes"`, `"Query.me"`) are not checked against a registered
  list yet: once a generated file registers the operations, write the nested form
  for the checked keys.
- Only the keys of the `conditions` map given to `compilePolicy` are checked,
  not the `when` names inside the rules. A missing condition is still a
  `RulesError` at run time.
- The rule bodies (`permissions`, `roles`, `when`) are not narrowed.
- A value already typed `Rules`, such as the output of `parseRules`, is passed to
  `compilePolicy` directly. It does not go through `definePolicy` once graphql
  is registered.

## What was removed from `@softistx/security` 5

| Was | Now |
| --- | --- |
| `keto` | `relations` |
| `namespace` of a relation term | `type` |
| `id` of a relation term | `from` |
| `message` of a relation rung | `code`: it is the refusal's code |
| `expression` | `when: [name]` naming a condition registered in code |
| `authorities` | `roles`, in DNF (outer OR, inner AND) |
| `$domain` in a role name | removed: per-tenant roles are not in 1.0 |
| an empty `permissions` or `roles` list meaning "authenticated" | refused: write `authenticated: true` |
| `cors`, `rateLimit`, `global.providers` | removed: never enforced |
| `global.unmatched` optional | required |
| no version key | `limix: 1` |

Each removed key fails with a message saying what to write instead; see
[troubleshooting](troubleshooting.md). The [migration guide](migrating-from-security.md)
gives a before and after for each.

## Editor completion

The package ships `schema/rules.schema.json`, generated from the same schemas
that validate. Point your editor at it with the first line of the YAML file
(`# yaml-language-server: $schema=...`), or import it as
`@softistx/limix/rules.schema.json`. In this repository, `bun run schema:gen`
regenerates it and a spec fails when the committed file drifts.
