# @softistx/limix-codegen

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
