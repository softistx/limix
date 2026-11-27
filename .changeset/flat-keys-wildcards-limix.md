---
'@softistx/limix': minor
---

Rules may be written with flat keys, `"POST /users/:id"` under `rest` and `"Query.me"` under `graphql`, beside the nested spelling and mixed with it; every rule keeps the place of its key in document order, and a rule named twice is a compile error naming both keys. A bare `*` ends a path pattern (the rest of the path, nothing captured), the method `*` stands for any method (an exact method wins on the same pattern) and `Type.*` stands for every field of a type that has no rule of its own. Coverage reports `match: 'wildcard'` and `summary.byWildcard`. `CompiledPolicy` gains `restRoutes` (each rule once, in document order), `CompiledRestRoute` a `method` and a `where`, `CompiledGraphqlEntry` a `where` and a `wildcard`. `Rules['rest']` and `Rules['graphql']` are keyed by both spellings, so a computed `string` key in a `definePolicy` literal needs a cast.
