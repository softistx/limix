---
'@softistx/limix-alxia': patch
---

A guarded plugin's `limixGraphql` endpoint, mounted under a host prefix (a host `prefix`, a prefixed group, or twice), is left to its field guard again instead of answering 403: the host guard tells the plugin guard which definition it matched, and the plugin guard accepts it only for a mounted copy of its own endpoint. A host without a guard still refuses it. Fixes #44.
