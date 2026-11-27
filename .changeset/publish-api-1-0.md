---
'@softistx/limix-publish': minor
---

The 1.0 surface of limix-publish. Breaking: `ALGS` is now `ALGORITHMS` (core's list, re-exported), and `DEFAULT_EXPIRES_IN` is no longer exported (the default stays 86400 seconds, documented). Added: `signRules({ conditions })` also accepts the predicate map a reader registers (`Readonly<Record<string, Condition>>`), and uses its keys; a `string[]` still works.
