---
'@softistx/limix': minor
---

Export `holdsPermission(claims)`, the permission test the evaluation uses: a name holds when it is a token of `scope` and, when the `permissions` claim is present, also in that list. Anything malformed holds nothing. An integration can use it to answer a synchronous "can this caller?" question with the same fail-closed rules.
