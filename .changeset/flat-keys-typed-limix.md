---
'@softistx/limix': minor
---

`definePolicy` checks flat keys against the operations a generated file registers: `"GET /notes"` and `"Query.me"` must be registered operations and `"Note.*"` needs a registered type, as the nested spelling already did. The method `*` and the field `*` are accepted under a registered path or type. A key with a wildcard or an optional group stays unchecked. The new `TypedRulesInput` type is what `definePolicy` takes; `TypedRules` is unchanged and every `TypedRules` value is a `TypedRulesInput`. One inline literal is now refused: a flat key holding a method map (`'GET /files/*path': { GET: rule }`), which `parseRules` already refused. `RulesInput` is still what `compilePolicy` takes.

`compilePolicy` refuses a rule that carries a key which is no rule term (`roles`, `permissions`, `relations`, `when`, `authenticated`, `public`), such as a method map under a flat key reached through a variable or a spread. It used to compile to a rule with no requirement, which allowed every caller. Fix the rule: put its terms under the key, or nest it under a path or a type.
