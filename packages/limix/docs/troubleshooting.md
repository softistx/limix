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
`json.`. On a GraphQL rule the message ends with `"args.<path>" or
"source.<path>"`. A rule written for one transport cannot be pasted in the other
without changing `from`.

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

## unsupported extension `<ext>`: use .yaml, .yml or .json

`loadRules` picks the parser by file extension. Rename the file, or read it
yourself and pass the value to `parseRules`.

## not readable: <reason>

The file has the right extension but is not valid YAML or JSON; the reason is
the parser's. Fix the syntax.
