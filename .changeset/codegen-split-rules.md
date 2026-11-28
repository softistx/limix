---
'@softistx/limix-codegen': minor
---

The generated file exports `RestRules` and `GraphqlRules`, the types of a block of rules kept in its own file.

- `RestRules<W extends string = ConditionName>` is `RestRulesInput<Register, W>` and `GraphqlRules<W>` is `GraphqlRulesInput<Register, W>`; each is written only when REST or GraphQL operations are generated. A block written `satisfies RestRules<'ownsBook'>` refuses an unknown path, method, role, permission or condition where it lives, then goes to `definePolicy` in a list.
- The file now starts with a type-only import from `@softistx/limix` (a module either way, so the `Register` augmentation is unchanged). Run `limix-codegen generate` again to refresh it; `--check` reports the old file as out of date.
- Requires `@softistx/limix` with `RestRulesInput` and `GraphqlRulesInput`.
