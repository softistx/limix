---
'@softistx/limix-janus': patch
---

`checkModel` names a rule by its key as the rules file spells it, flat (`rest['GET /files/:id']`, `graphql['Note.*']`) or nested.

Issues now come in document order, flat and nested keys interleaved, instead of grouped by method.
