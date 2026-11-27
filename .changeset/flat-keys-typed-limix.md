---
'@softistx/limix': minor
---

`definePolicy` checks flat keys against the operations a generated file registers: `"GET /notes"` and `"Query.me"` must be registered operations and `"Note.*"` needs a registered type, as the nested spelling already did. The method `*` and the field `*` are accepted under a registered path or type. A key with a wildcard or an optional group stays unchecked. The new `TypedRulesInput` type is what `definePolicy` takes; `TypedRules` is unchanged and every `TypedRules` value is a `TypedRulesInput`, so nothing that type-checked stops doing so. `RulesInput` is still what `compilePolicy` takes.
