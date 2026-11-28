---
'@softistx/limix-codegen': minor
---

Codegen is types only (breaking, 0.4): its one job is to generate the types that make a code-first `definePolicy` type-safe. It never reads a policy, a YAML or JSON rules file included, and 0.3's `--rules` is reverted.

- Removed: `--rules` of `generate` and `init` (a script that still passes it exits 2 with `Unknown option '--rules'`), the plugin's `rules` option, the stale-rule report and its exit code, and the `LimixPermission`, `LimixRole` and `LimixCondition` types with their `Register` keys. `generate` writes `LimixRest` and `LimixGraphql` only; `--check` means the file is missing or out of date, nothing more. Check a YAML policy against the API with `@softistx/limix/coverage`.
- `init` writes a TypeScript `policy.ts` (`--out`, default `src/policy.ts`, a `.ts` file, never overwritten): a `definePolicy` call with `authenticated: true` on every REST operation and GraphQL root field under `unmatched: 'deny'`, nested by default or one key per operation with `--flat`, importing the generated file relative to `--types` (default `src/generated/limix.ts`). `starterRules` is replaced by `starterPolicy(operations, { flat, types })`, which returns the TypeScript source.

Migration from 0.3:

1. Drop `--rules ...` from your `generate` and `check` scripts, and run `limix-codegen generate` again. Do it before the next step: a duplicate `role` key (the generated one and yours) conflicts, `Subsequent property declarations must have the same type`.
2. Declare the names your policy uses once, by hand, so that `definePolicy` narrows `roles`, `permissions` and `when`:

   ```ts
   declare module '@softistx/limix' {
     interface Register {
       role: 'admin' | 'editor'
       permission: 'notes:read' | 'notes:write'
     }
   }
   export {}
   ```

   The condition names need no declaration when you pass the conditions to `definePolicy(rules, { conditions })`.
3. Write the policy in code with `definePolicy` (needs `@softistx/limix` 0.7). A YAML or JSON rules file is not typed by codegen any more.
