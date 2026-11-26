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

`loadRules` picks the parser by file extension. Rename the file, or read it
yourself and pass the value to `parseRules`.

## not readable: <reason>

The file has the right extension but is not valid YAML or JSON; the reason is
the parser's. Fix the syntax.

## ENOENT: no such file or directory, open '<path>'

`loadRules` throws the raw `node:fs` error, not a `RulesError`, when the file is
missing (`ENOENT`) or unreadable (`EACCES`): the `RulesError` is for what the
file says, not for reaching it. Check the path (it is resolved from the
process's working directory) and the permissions, or catch the error where you
call `loadRules`:

```ts
try {
  rules = await loadRules('rules.yaml')
} catch (error) {
  if (error instanceof RulesError) /* the file is wrong */
  else /* the file could not be read */
  throw error
}
```
