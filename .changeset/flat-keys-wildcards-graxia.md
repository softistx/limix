---
'@softistx/limix-graxia': minor
---

A `Type.*` rule guards every field of the type that has no rule of its own, root or not: `entryOf` falls back to the wildcard, so such a field is wrapped instead of left open. Under `nonNull: 'refuse'` the setup check names each non-null field a wildcard covers. Needs `@softistx/limix` with flat keys and wildcards.
