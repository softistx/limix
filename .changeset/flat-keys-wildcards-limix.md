---
'@softistx/limix': minor
---

Rules may be written with flat keys, `"POST /users/:id"` under `rest` and `"Query.me"` under `graphql`, beside the nested spelling and mixed with it; every rule keeps the place of its key in document order. A bare `*` ends a path pattern (the rest of the path, nothing captured), the method `*` stands for any method (an exact method wins on the same pattern) and `Type.*` stands for every field of a type that has no rule of its own. Coverage reports `match: 'wildcard'` and `summary.byWildcard`, and reads a wildcard name as no part of a spelling (`GET /a/*` is the rule of the operation `GET /a/*path`). `CompiledPolicy` gains `restRoutes` (each rule once, in document order), `CompiledRestRoute` a `method` and a `where`, `CompiledGraphqlEntry` a `where` and a `wildcard`. `definePolicy` and `compilePolicy` take a `RulesInput`, which also accepts flat `graphql` keys; `Rules` keeps its earlier shape.

Behaviour changes to know when upgrading:

- A pattern named twice is now a compile error: `/a` and `/a/` with the same method are one rule written twice, and so are a flat key and a nested one naming the same method and pattern.
- A key under `rest` shaped `WORD /x` that is not a method in capitals followed by one space (`get /x`, `GET  /x`) is refused instead of read as a path; a path that holds a space starts with `/`.
- A rule written straight under a path pattern, or a method map under a flat key, is refused by `compilePolicy`.
