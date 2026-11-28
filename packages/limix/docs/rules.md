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
| `definePolicy(rules, { conditions })` | Writes the document in code, flat or nested keys (`rest` and `graphql` take one block or a [list of blocks](#splitting-a-policy-across-files)): a compile error on a typo, then nests, validates and returns the same `Rules` as `parseRules` ([flat keys](#flat-keys-in-definepolicy)) |
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

The path of an issue is the key as you wrote it: `rest['/documents'].GET`.

`error.issues` holds the same as `{ path, message }` pairs.

## The document

`Rules` is an explicit, hand-written type. A test holds it mutually assignable
with the schema's inference, so the type you import does not move with a release
of the validation library.

| Key | Meaning |
| --- | --- |
| `limix` | The format version. Always `1`. Required |
| `global` | Settings for the whole document. Required |
| `rest` | Rules by path pattern, then HTTP method |
| `graphql` | Rules by type name, then field name |
| `x-...` | Free keys for YAML anchors; dropped when parsing |

Any other top-level key throws.

### `global`

- `unmatched` (required): `allow` or `deny`. What a REST path, or a GraphQL root
  field, that no rule names is answered. `deny` makes the file the exhaustive
  list of what the service exposes. It is required so that leaving a door open
  is written down.
- `basePath`: a prefix put before every REST pattern, e.g. `/api`.

### REST rules

A key under `rest` is a path pattern; its value is keyed by method. The rules
format (a YAML or JSON file, and what `parseRules` and `compilePolicy` take) is
nested only. The flat spelling (`"GET /documents"`) is a `definePolicy` key and
nothing else: see [Flat keys in `definePolicy`](#flat-keys-in-definepolicy). A
flat key in a rules file is refused with the nested spelling to write:

```
rest['POST /documents']: `POST /documents` is a definePolicy key; in a rules file write "/documents": { POST: … }
```

```yaml
rest:
  /documents:
    GET:
      authenticated: true
  /documents/:id:
    GET:
      authenticated: true
    POST:
      permissions: [[documents:write]]
    DELETE:
      roles: [[admin]]
```

```ts
definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    '/documents': { GET: { authenticated: true } },
    '/documents/:id': {
      GET: { authenticated: true },
      POST: { permissions: [['documents:write']] },
      DELETE: { roles: [['admin']] },
    },
  },
})
```

The methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`,
`CONNECT`, `TRACE` and `QUERY`, and `*` for any (below). A rule term written
where a method belongs (`/x: { roles: [[a]] }`) is refused with a hint to nest
it under a method.

**Document order.** Every rule keeps the place of its key in the document, and
the first rule whose pattern matches, in document order, is
used, for a `route` and a `path` alike: write static patterns before the param or
wildcard ones that take them. Coverage reports a rule that never applies as stale
with `shadowedBy`.

```yaml
rest:
  /notes/new:            # first: /notes/new is judged here
    GET:
      public: true
  /notes/:id:
    GET:
      authenticated: true
```

**No duplicates.** Two keys that name the same rule are a compile error that
names both:

```
duplicate rule: rest['/users/'].POST and rest['/users'].POST both name POST /users
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
| `/files/*` | the same with no name: nothing is captured, so no `param.` term can read it. A `*` takes one or more characters: `/files/*` does not take `/files`; write `/files{/*}` for both |
| `/things{/:id}` | an optional part: `/things` and `/things/7` |
| `/a\:b` | a backslash makes the next character literal: the path `/a:b` |

A pattern that does not parse (`/a(`, `/a/:`) is reported with the index of the
character; see [troubleshooting](troubleshooting.md#invalid-path-pattern-reason).
A `*` in the middle of a segment (`/a*`) takes the rest of the path from there.

#### Any method: `*`

The method `*` stands for every method: `/admin/*: { "*": ... }`. The `*` of the
path takes one or more characters, so `/admin/*` does not take `/admin` itself:
write `/admin{/*}` to cover both.

```yaml
rest:
  /admin/health:         # another key: the first match in document order wins,
    GET:                 # so it goes before the wildcard that would take it
      public: true
  /admin/*:
    "*":
      roles: [[admin]]
```

- A method has its own rules, and the `*` rules are among them, each in its own
  place in document order: `POST /admin/x` meets the first rule, in document
  order, that is for `POST` or for `*` and whose pattern takes the path.
- An exact method beats `*` **on the same pattern**, wherever each is written:
  with `GET` and `"*"` under `/files/:id`, `GET` meets the first and any other
  method the second. On a different pattern the document order decides, as for
  any two rules.
- `HEAD` faces its own rules and then the `GET` ones, as always; a `*` rule that
  both lists reach is judged once.
- `*` includes `OPTIONS` and `HEAD`. An authenticated `*` rule therefore
  refuses a CORS preflight, which carries no credentials. Give the same pattern
  an `OPTIONS` rule of its own, which beats the `*` on that pattern:

  ```yaml
  rest:
    /api/*:
      "*":
        authenticated: true
      OPTIONS:
        public: true
  ```

- A method outside the list above (WebDAV's `PROPFIND`, for example) is judged by
  the `*` rules alone.

#### Writing the keys in YAML

An unquoted `*` is a YAML alias. Quote the method `*` under a path, and a key
that starts with `*`:

```yaml
rest:
  /files/*:              # fine: the star is not first
    "*":                 # quoted: the method *
      authenticated: true
```

### GraphQL rules

A key under `graphql` is a type name; its value is keyed by field name. As for
REST, the flat spelling (`Query.me`, `Note.*`) is `definePolicy`'s alone and is
refused in a rules file with the nested one to write.

```yaml
graphql:
  Query:
    me:
      authenticated: true
  Mutation:
    publishDocument:
      roles: [[editor], [admin]]
    archiveDocument:
      roles: [[admin]]
```

`Query`, `Mutation` and `Subscription` cover root fields; any other type name
guards fields of that type. The field `*` stands for every other field of the
type (below).

#### Every field: `*`

The field `*` is the rule of every field of the type that has no rule of its own;
an exact field wins, wherever it is written:

```yaml
graphql:
  Note:
    "*":                 # every field of Note...
      authenticated: true
    id:                  # ...but id, which is public
      public: true
  Query:
    "*":
      roles: [[admin]]   # every root query field
```

- Under `Query: { "*": ... }` every query field has a rule, so none falls to
  `global.unmatched`; it is how a file says "the whole root, same rule".
- A `*` on a non-root type guards every `Note` field wherever a `Note`
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

## Flat keys in `definePolicy`

`definePolicy` alone accepts a second spelling, one key per rule: `"POST
/users/:id"` (a method or `*`, one space, the path pattern) under `rest`, and
`"Query.me"` or `"Note.*"` under `graphql`. It reads better for a route with one
method and diffs by operation. A document may mix both spellings:

```ts
export const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    'GET /documents': { authenticated: true },
    'POST /documents/:id': { permissions: [['documents:write']] },
    '/documents/:id': {
      GET: { authenticated: true },
      DELETE: { roles: [['admin']] },
    },
    '* /admin/*': { roles: [['admin']] },
  },
  graphql: {
    'Query.me': { authenticated: true },
    'Note.*': { authenticated: true },
    Mutation: { publish: { roles: [['editor']] } },
  },
})
```

`definePolicy` nests the flat keys, in document order, and validates the result as
`parseRules` does. What it returns is that nested `Rules`: `rules.rest['GET
/documents']` is `undefined`, `rules.rest['/documents']` holds the `GET`. The
rules format itself (a YAML or JSON file, `parseRules`, `compilePolicy`,
`limix-publish`) never sees a flat key.

- A flat key goes under its path. When the path already exists (an earlier flat
  or nested key), the rule **joins that earlier key**, which is a move up: REST
  rules are first-match in document order.
- That move is refused when it would jump over a rule that could answer the
  same request: a rule of the same method, a rule for `*`, or a `GET`/`HEAD` pair
  (a `HEAD` request faces the `GET` rules). The check is conservative, with no
  analysis of whether two patterns overlap. The message says how to fix it:

  ```
  Invalid rules in definePolicy: 1 issue
    rest['GET /a']: `GET /a` would move above `GET /b`: nest it under `/a`, or write `/b` after it
  ```

  Nest the rule under its path, or write the other path after it. (A rule
  already written nested that joins an earlier flat key gets the same refusal,
  worded for it: write it with the first rules of the path.)
- GraphQL rules are not first-match: they are grouped by type, wherever written.
- A rule written twice, in either spelling, is refused, naming both keys:

  ```
  duplicate rule: rest['POST /users/:id'] and rest['/users/:id'].POST both name POST /users/:id
  ```

- A flat key keeps its method case (`GET`, not `get`) and its single space. A
  key that looks flat and is not (`get /x`, `GET  /x`) is refused with a hint:
  [`` `get /x` is not a rule key: did you mean `GET /x`? ``](troubleshooting.md#get-x-is-not-a-rule-key-did-you-mean-get-x). It is no flat key
  for the types (they cannot tell it from a path), so it type-checks and throws
  at run time.
- Where issues name a flat-written rule: an error raised by `definePolicy`
  itself (an invalid body, a refused move, a duplicate) names the key as you
  wrote it (`rest['POST /users/:id'].roles[0]`). What `definePolicy` returns is
  nested, so later reports name the nested place: `compilePolicy` issues, the
  `where` of a compiled route, coverage and `checkModel` paths read
  `rest['/users/:id'].POST`.

A flat key in a rules file is refused by `parseRules`, with the spelling to write
instead. The `limix-codegen init --flat` command writes a policy in this form.

## Splitting a policy across files

A long policy can live in several files, each type-checked on its own. Write a
block with `satisfies RestRulesInput` (or `GraphqlRulesInput`), which refuses an
unregistered path, field, role, permission or condition exactly as an inline
`rest` does, then give `definePolicy` the blocks as a list:

```ts
// books.rules.ts
import type { RestRulesInput } from '@softistx/limix'

export const bookRules = {
  'GET /books': { public: true },
  '/books/:id': { GET: { authenticated: true } },
} satisfies RestRulesInput

// admin.rules.ts
export const adminRules = {
  '* /admin/*': { roles: [['admin']] },
} satisfies RestRulesInput

// policy.ts
export const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: [bookRules, adminRules],
})
```

- **List order is document order**, so it sets the first-match precedence of
  REST rules: write the specific block before the general one. The check that
  refuses a flat rule jumping over an earlier rule applies across blocks.
- `graphql` takes a list the same way. The result is the same nested `Rules`
  as one block holding every rule.
- **Do not spread** (`rest: { ...a, ...b }`): a key written in both would be
  overwritten silently. A list refuses it instead: a rule written twice across
  blocks, in either spelling, throws a `RulesError` naming both places
  ([`duplicate rule: rest[0]['/books'].GET and rest[1]['GET /books'] both name GET /books`](troubleshooting.md#duplicate-rule-rest0booksget-and-rest1get-books-both-name-get-books)).
- Rules of one path in two blocks join: `'/books': { GET }` in one and
  `'POST /books'` in the other are one group, at the first block's place.

## Typed operations and names

`definePolicy` reads a `Register` interface, filled in by module augmentation, so
a typo in a path, a method, a GraphQL type or field in a `definePolicy` literal,
or a role, permission or condition name nobody declared, fails to compile. Two
sources fill it:

- [`@softistx/limix-codegen`](../../limix-codegen/docs/codegen.md) writes the
  API's operations (`rest`, `graphql`) from its OpenAPI document and GraphQL
  schema. It never reads the policy.
- You declare the names the policy uses, once, by hand.

```ts
// src/generated/limix.ts (generated)
declare module '@softistx/limix' {
  interface Register {
    rest: 'GET /notes' | 'GET /notes/:id'
    graphql: 'Query.me'
  }
}

// src/vocabulary.ts (written by hand)
declare module '@softistx/limix' {
  interface Register {
    role: 'admin'
    permission: 'notes:read' | 'notes:write'
    condition: 'workingHours' // optional, see below
  }
}
```

```ts
definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    // error: `/notez` is not an operation of the API
    '/notez': { GET: { authenticated: true } },
    // error: 'root' is not a declared role
    'GET /notes': { roles: [['root']] },
  },
})
```

`roles`, `permissions` and `when` are narrowed to the declared unions. For `when`,
pass the conditions to `definePolicy` as well as to `compilePolicy`, and the names
come from their keys, with no declaration:

```ts
import { compilePolicy, definePolicy, type ConditionMap } from '@softistx/limix'

const conditions = {
  workingHours: ({ claims }) => claims['shift'] === 'day',
} satisfies ConditionMap

const rules = definePolicy(
  { limix: 1, global: { unmatched: 'deny' }, rest: { 'GET /x': { when: ['workingHours'] } } },
  { conditions }, // read for its keys only: definePolicy never calls a condition
)
const policy = compilePolicy(rules, { conditions })
```

`definePolicy<typeof conditions>({...})` does the same without the second
argument. When `Register.condition` is declared by hand, the object's keys are
checked against it. `ConditionMap<R>` is what the `conditions` option takes.

`Permission`, `Role`, `ConditionName`, `RestOperationName` and
`GraphqlOperationName` give the registered unions to your own code;
`TypedRulesInput` (flat and nested keys, what `definePolicy` takes) and
`TypedRules` (nested keys only, over `Rules`; every `TypedRules` value is a
`TypedRulesInput`) are the narrowed documents, `RestRulesInput` and
`GraphqlRulesInput` the `rest` and `graphql` members of `TypedRulesInput` on
their own (one block, for `satisfies`), `DefinePolicyOptions` the options.
Nothing is registered by default: until something is declared, every type is
what it was (`string`).

| Key you write | Checked against the registered list? |
| --- | --- |
| `rest: { '/notes': { GET } }` (nested) | Yes: the path, and the method on that path; the method `*` is accepted under a known path |
| `rest: { 'GET /notes': rule }` (flat) | Yes, as written, `:id` names included |
| `rest: { '* /notes': rule }`, `'/files/*path'`, `'/x/*'`, `'GET /a{/:b}'` | No: a wildcard or an optional group names several routes |
| `graphql: { Query: { me } }` (nested) | Yes: the type, and the field; the field `*` is accepted under a known type |
| `graphql: { 'Query.me': rule }`, `'Note.*'` (flat) | Yes: `Type.field` must be registered, `Type.*` needs a registered type |
| `roles`, `permissions` | Against `Register.role` and `Register.permission` |
| `when` | Against the keys of `options.conditions`, else `Register.condition` |

When only `rest` is registered, `graphql` is not checked, and the other way round.
Writing the policy out and checking it in CI: [Writing rules](../../limix-codegen/docs/writing-rules.md).

What is checked, and what is not:

- A refusal holds only in an inline object literal given to `definePolicy`. A
  variable, a spread, an escaped `\*` key or a `{` key is accepted unchecked, and
  so is a key with a wildcard or a `{...}` group, which names several routes.
- The lists of `roles` and `permissions` are mutable in the types: a body written
  `as const` is refused once names are declared. Write it inline.
- A key with a wildcard or an optional group is never checked by the types;
  coverage reports a rule that reaches no operation of the spec.
- A rules file (YAML or JSON) is not typed: it never goes through `definePolicy`.
  Check it against the API with [coverage](coverage.md).
- A value already typed `Rules`, such as the output of `parseRules` or
  `definePolicy`, goes to `compilePolicy` directly.

## What `compilePolicy` returns

A `CompiledPolicy` is for the limix integrations; of it only `global` and
`usesRelations` are for hosts, and the rest may change in a minor release.

| Member | Holds |
| --- | --- |
| `restRoutes` | Every REST rule once, in document order. Iterate this to report per rule |
| `restRoutesByMethod` | The routes each method faces, in document order. A rule for method `*` is in every method's list (an exact rule of the same pattern takes its place) and, alone, under the key `*`, which a method outside the usual ten faces |
| `graphql` | Rules by type, then field; a `Type.*` rule is under the field `*` |

Each `CompiledRestRoute` has `pattern` (with the `basePath`), `method` (`*` for
any) and `where`, the rule's place as an issue path (`rest['/a'].POST`). Each
`CompiledGraphqlEntry` has `where` (`graphql.Query.me`) and `wildcard`, true for
the field `*` of a type.

```ts
const policy = compilePolicy(rules)
for (const route of policy.restRoutes) console.log(route.method, route.pattern, route.where)
```

## Upgrading from 0.6

0.7 takes the flat spelling out of the rules format and gives it to `definePolicy`:

- A flat key in a rules file (YAML or JSON, `parseRules`, `loadRules`,
  `compilePolicy`) is refused with the nested spelling to write. Nest the file,
  or write the document with `definePolicy`.
- `RulesInput` is removed: `compilePolicy` takes a `Rules`, and `Rules['rest']`
  is `Record<string, RestMethods>` again.
- `definePolicy` validates at run time and throws a `RulesError` (it returned
  its argument unchecked); it returns the nested `Rules` `parseRules` returns,
  so `rules.rest['GET /x']` is `undefined` and `rules.rest['/x'].GET` holds the
  rule. It refuses a flat rule whose move would jump over a competing rule.
- A remote token signed with flat keys is refused by 0.7 clients: re-sign it
  nested first (a 0.6 client reads nested keys), then upgrade the clients. See
  [Moving from 0.6 flat keys](remote.md#moving-from-06-flat-keys).
- `roles`, `permissions` and `when` are narrowed to what a program declares in
  `Register` and to the keys of `definePolicy`'s `conditions`; codegen 0.4 no
  longer generates those names.

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
