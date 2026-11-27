---
'@softistx/limix': minor
---

`Register`: definePolicy refuses a rule on an operation the registered list does not hold, and compilePolicy a condition the rules file does not name; `Permission`, `Role`, `ConditionName`, `RestOperationName`, `GraphqlOperationName`, `TypedRules` and `ConditionMap` read it. Nothing is registered by default, so nothing changes until a generated file registers it.
