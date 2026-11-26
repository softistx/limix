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
never reports a valid file. It reads block mappings by indentation, block
sequences (`- key:` opens a mapping), plain, single-quoted and double-quoted
keys (`a`, `"a"` and `'a'` are one key), comments, block scalars (their content
is skipped), anchors, aliases and tags, and flow mappings on one line
(`{ a: 1, b: 2 }`). What it does not read it skips instead of guessing:

- a mapping with a merge key `<<` (Bun applies merges) or an alias used as a key is not checked;
- a flow collection over several lines is skipped, and so is its mapping;
- a complex key (`? key`) stops the check at that line;
- escapes other than `\"` and `\\` in a double-quoted key are compared as written.

So a repeat in one of those places is not caught: write keys once there too.
`parseRules` on a value you parsed yourself cannot see duplicates, the parser
has already dropped them.

A `RulesError` lists every issue, not the first:

```
Invalid rules in rules.yaml: 2 issues
  global.unmatched: Invalid option: expected one of "allow"|"deny"
  rest['/documents'].GET.keto: `keto` is removed: use relations
```

`error.issues` holds the same as `{ path, message }` pairs.

## The document

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

Keyed by path pattern (`:name` for one segment, `*name` for the rest of the path, `{...}` for an optional part, `\` to write a special character literally), then by method (`GET`, `POST`,
`PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`, `CONNECT`, `TRACE`, `QUERY`). The
first pattern that matches, in document order, is used.

### GraphQL rules

Keyed by type name, then field name. `Query`, `Mutation` and `Subscription`
cover root fields; any other type name guards fields of that type.

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
refused. When absent it is `DEFAULT_FROM.rest` (`param.id`) on REST and
`DEFAULT_FROM.graphql` (`args.id`) on GraphQL. A REST `param.<name>` must be a
parameter the route's pattern captures, default included: `compilePolicy`
refuses the rest. An absent `onDeny` is
`DEFAULT_ON_DENY` (`NOT_FOUND`). Both constants are exported:

```ts
import { DEFAULT_FROM, DEFAULT_ON_DENY } from '@softistx/limix'
```

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
[troubleshooting](troubleshooting.md).

## Editor completion

The package ships `schema/rules.schema.json`, generated from the same schemas
that validate. Point your editor at it with the first line of the YAML file
(`# yaml-language-server: $schema=...`), or import it as
`@softistx/limix/rules.schema.json`. In this repository, `bun run schema:gen`
regenerates it and a spec fails when the committed file drifts.
