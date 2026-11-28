# @softistx/limix-codegen

## 0.4.0

### Minor Changes

- [#61](https://github.com/softistx/limix/pull/61) [`1c2ea26`](https://github.com/softistx/limix/commit/1c2ea26efe7d27cc549d8621d812a1e0165f3a78) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Codegen is types only (breaking, 0.4): its one job is to generate the types that make a code-first `definePolicy` type-safe. It never reads a policy, a YAML or JSON rules file included, and 0.3's `--rules` is reverted.
  
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

### Patch Changes

- Updated dependencies [[`1c2ea26`](https://github.com/softistx/limix/commit/1c2ea26efe7d27cc549d8621d812a1e0165f3a78)]:
  - @softistx/limix@0.7.0
  - @softistx/limix-graxia@0.3.1

## 0.3.0

### Minor Changes

- [#58](https://github.com/softistx/limix/pull/58) [`2e3ccfc`](https://github.com/softistx/limix/commit/2e3ccfc97878927553ef7e9080ddea7bd85efa44) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `generate` reads the rules file against the operations it was given (`--rules` with `--openapi` or `--graphql`) and reports each rule that reaches none: a key that names no route, a rule shadowed by an earlier one, a type or a field the schema does not have. Without `--check` these are warnings on stderr and the exit code stays 0; with `--check` they fail the run (exit 1) together with an out-of-date file.
  
  Upgrade note: on 0.2 `generate --check` judged no rules. From 0.3 it fails (exit 1) on every rule that reaches no operation of the spec: a rule shadowed by an earlier one, a wildcard that reaches nothing, a type or field the schema does not have, and an exact key missing from the spec (`"GET /notez"`). A route the server serves but the spec omits needs adding to the spec. A rules file that does not compile is reported as `<rules> does not compile, its rules were not judged` and fails `--check` too. Without `--check` all of these are warnings. REST rules are judged only with `--openapi` and GraphQL rules only with `--graphql`; the troubleshooting page gives each message and its fix.
  
  `init --flat` writes one key per operation (`"GET /notes"`, `"Query.me"`); `starterRules` takes an optional third argument `{ flat }` and its two-argument call is unchanged. A guide to writing rules, `docs/writing-rules.md`, covers generating, typed `definePolicy` with flat and nested keys, the patterns, what the types and `--check` catch, and CI.

### Patch Changes

- [#56](https://github.com/softistx/limix/pull/56) [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The names of permissions, roles and conditions are read from flat keys and `Type.*` rules as well as from nested ones.
- Updated dependencies [[`5ebdc55`](https://github.com/softistx/limix/commit/5ebdc5564ebcc7ece1c7033649857271eefd6155), [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d), [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d)]:
  - @softistx/limix@0.6.0
  - @softistx/limix-graxia@0.3.0

## 0.2.0

### Minor Changes

- [#46](https://github.com/softistx/limix/pull/46) [`b4a98ba`](https://github.com/softistx/limix/commit/b4a98ba7ce681cee5c4c10467f041681cc92f87e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `openapiPath` is removed from the exports: the OpenAPI path converter is `rulesPathOf` from `@softistx/limix/coverage`, which `openapiOperations` now uses.

### Patch Changes

- Updated dependencies [[`b4a98ba`](https://github.com/softistx/limix/commit/b4a98ba7ce681cee5c4c10467f041681cc92f87e), [`91b1b87`](https://github.com/softistx/limix/commit/91b1b87a2280287a1c426d5223f6f93debccd644), [`d30f58c`](https://github.com/softistx/limix/commit/d30f58cdfc19c2604fd246e17fc35df5d5673fec)]:
  - @softistx/limix@0.5.0
  - @softistx/limix-graxia@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`35d93c0`](https://github.com/softistx/limix/commit/35d93c016bed2112db44aadfa3b27cdb971c15c9)]:
  - @softistx/limix@0.4.0
  - @softistx/limix-graxia@0.1.1

## 0.1.0

### Minor Changes

- [#37](https://github.com/softistx/limix/pull/37) [`86149a7`](https://github.com/softistx/limix/commit/86149a74342d506a11889c240bd1acb270d2bd8c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - First published version. `@softistx/limix-graxia` guards the fields of a graxia (graphql-js) schema (`guardSchema`, `limixGraxia`), checks `@needs` against the rules (`checkNeeds`, `canOf`) and lists a schema's operations for coverage (`graphqlOperations`, also alone on `./operations`). `@softistx/limix-alxia` guards the routes of an alxia app (`limixGuard`), lists them for coverage (`alxiaOperations`), checks that the rules fit them (`checkRoutes`, `checkGuard`) and serves a GraphQL endpoint behind the same rules (`limixGraphql` on `./graphql`). `@softistx/limix-codegen` registers the API's operations and the rules file's names in `Register` (the `limix-codegen` command and a graphql-codegen plugin) and writes a starter rules file.

### Patch Changes

- Updated dependencies [[`86149a7`](https://github.com/softistx/limix/commit/86149a74342d506a11889c240bd1acb270d2bd8c)]:
  - @softistx/limix-graxia@0.1.0
