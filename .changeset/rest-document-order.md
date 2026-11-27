---
"@softistx/limix": minor
"@softistx/limix-alxia": patch
---

Coverage and `evaluateRest` resolve overlapping REST patterns by one walk in document order. A `route` is no longer matched exactly before the earlier patterns, so a static rule declared after a param or wildcard rule that takes its path no longer applies to `route` callers, as it never did to `path` callers. Coverage reports such a rule as stale with `shadowedBy`. Fixes #33.
