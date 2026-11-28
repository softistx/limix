---
'@softistx/limix': minor
---

The rules format is nested only again, and `definePolicy` is where flat keys and typed rule bodies live (breaking, 0.7).

- A flat key (`"POST /users/:id"`, `"Query.me"`, `"Note.*"`, `"* /admin/*"`) in a rules document is refused by `parseRules`, `loadRules` and `compilePolicy`, with the nested spelling to write: `` `POST /users/:id` is a definePolicy key; in a rules file write "/users/:id": { POST: … } ``. Wildcards stay in their nested spelling: a bare `*` in a path, the method `"*"` under a path, the field `"*"` under a type. `schema/rules.schema.json` refuses the flat keys too. `RulesInput` is removed: `compilePolicy` takes a `Rules`, and `Rules['rest']` is `Record<string, RestMethods>` again.
- `definePolicy` still takes flat keys, beside nested ones. It nests them in document order (a flat rule joins an earlier key of its path), refuses a move that would jump over a rule that could answer the same request (same method, a `*` rule, or a `GET`/`HEAD` pair) with ``` `GET /a` would move above `GET /b`: nest it under `/a`, or write `/b` after it ```, refuses a rule written twice, and then validates the document as `parseRules` does. What it returns is that canonical nested `Rules`: `rules.rest['GET /x']` is `undefined` now, `rules.rest['/x'].GET` holds the rule, and an invalid document throws a `RulesError` at run time (it used to return its argument unvalidated).
- Rule bodies are typed. `roles`, `permissions` and `when` are narrowed to the names a program declares in `Register` (`role`, `permission`, `condition`), and `definePolicy(rules, { conditions })` (or `definePolicy<typeof conditions>(rules)`) narrows `when` to the keys of the conditions you also give to `compilePolicy`; `definePolicy` only reads their keys and never calls one. New type `DefinePolicyOptions`. `TypedRules` and `TypedRulesInput` take the condition names as a second parameter. The lists are mutable: a body written `as const` is refused once names are declared.

Migration:

- A rules file with flat keys (written for 0.6): nest them, or move the document into `definePolicy`. A remote document signed on 0.6 with flat keys is refused by 0.7 clients (the client keeps its last good copy): re-sign it nested, with `limix-publish` 0.7 and a nested source.
- Code that read `rules.rest[...]` or `rules.graphql[...]` of a `definePolicy` result by a flat key: read the nested key. Code that named `RulesInput`: use `Rules`, or `TypedRulesInput` for what `definePolicy` takes.
- A test that called `definePolicy` with an invalid document and relied on it returning the argument: it throws now.
- `limix-codegen` 0.4 no longer generates `permission`, `role` and `condition` in `Register`: declare them by hand (see the typed operations section of the rules guide).
