---
'@softistx/limix': minor
---

A code-first policy's rules can be written in several files.

- New types `RestRulesInput` and `GraphqlRulesInput`: the `rest` and `graphql` members of `TypedRulesInput` on their own. A block written `satisfies RestRulesInput` is checked where it lives, refusing an unregistered path, field, role, permission or condition like an inline literal.
- `definePolicy` takes `rest` and `graphql` as one block or a list of blocks. A list is read in order as one document (list order is the first-match order), and the flat-rule move check applies across blocks. A rule written in two blocks throws a `RulesError` naming both places, for example ``duplicate rule: rest[0]['/books'].GET and rest[1]['GET /books'] both name GET /books``. A single block behaves as before.
- A list element that is not an object is refused with `rest[<i>]: a rules block must be an object`, and a group that is not an object keeps its block index (`graphql[1].Query`) without replacing an earlier block's group. A nested group joined across blocks over a competing rule is refused, naming the block of the first group.
