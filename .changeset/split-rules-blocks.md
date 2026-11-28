---
'@softistx/limix': minor
---

A code-first policy's rules can be written in several files.

- New types `RestRulesInput` and `GraphqlRulesInput`: the `rest` and `graphql` members of `TypedRulesInput` on their own. A block written `satisfies RestRulesInput` is checked where it lives, refusing an unregistered path, field, role, permission or condition like an inline literal.
- `definePolicy` takes `rest` and `graphql` as one block or a list of blocks. A list is read in order as one document (list order is the first-match order), and the flat-rule move check applies across blocks. A rule written in two blocks throws a `RulesError` naming both places, for example ``duplicate rule: rest[0]['/books'].GET and rest[1]['GET /books'] both name GET /books``. A single block behaves as before.
- Type error location: a refused key in an inline `rest` or `graphql` of `definePolicy` is now reported on the `rest` or `graphql` property rather than on the key, since it accepts a block or a list.
