---
'@softistx/limix': minor
---

The 1.0 surface of the core. Breaking: `OUTAGE_MESSAGE`, `POLICY_SOURCE`, `LIMIX_REFUSAL`, `DEFAULT_FROM` and `DEFAULT_ON_DENY` are no longer exported (the contract between copies is the `Symbol.for('limix.policy-source')` and `Symbol.for('limix.refusal')` registry keys); `CompiledPolicy`, `CompiledRestRoute` and `CompiledGraphqlEntry` are readonly all the way down (only `global` and `usesRelations` are for hosts); `RemotePolicy.refresh()` answers `{ changed, error? }` instead of a boolean; `rulesPathOf` now quotes and escapes as `limix-codegen`'s `openapiPath` did (`{id}.json` becomes `:id.json`) and throws a `TypeError` for a path with no limix spelling. Added: the `Refusal` interface, `JSONWebKeySet` from `/remote`, and an explicit `Rules` type held equal to the schema's inference by a type test.
