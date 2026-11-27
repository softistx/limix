# @softistx/limix

## 0.3.0

### Minor Changes

- [#34](https://github.com/softistx/limix/pull/34) [`dd6a73f`](https://github.com/softistx/limix/commit/dd6a73f6af019dbb5f88b4a4344be77670a0dbae) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `Register`: definePolicy refuses a rule on an operation the registered list does not hold, and compilePolicy a condition the rules file does not name; `Permission`, `Role`, `ConditionName`, `RestOperationName`, `GraphqlOperationName`, `TypedRules` and `ConditionMap` read it. Nothing is registered by default, so nothing changes until a generated file registers it.

## 0.2.0

### Minor Changes

- [#30](https://github.com/softistx/limix/pull/30) [`5e57f61`](https://github.com/softistx/limix/commit/5e57f616572ad303a5bbe397ab23fa5c849edce0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Export `holdsPermission(claims)`, the permission test the evaluation uses: a name holds when it is a token of `scope` and, when the `permissions` claim is present, also in that list. Anything malformed holds nothing. An integration can use it to answer a synchronous "can this caller?" question with the same fail-closed rules.

## 0.1.1

### Patch Changes

- [#27](https://github.com/softistx/limix/pull/27) [`3d6413a`](https://github.com/softistx/limix/commit/3d6413a218efc42501a4b4ebf88ae84b0a2a1b2b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - No change from 0.1.0. It was released while a failed publish run was read as 0.1.0 missing from npm; 0.1.0 is on npm too.

## 0.1.0

### Minor Changes

- [#25](https://github.com/softistx/limix/pull/25) [`0308dc1`](https://github.com/softistx/limix/commit/0308dc1dc048bf134bae5148aefafd7086decb24) Thanks [@SteveGT96](https://github.com/SteveGT96)! - First published version. `@softistx/limix` holds the rules format and its evaluation (`definePolicy`, `evaluateRest`, `evaluateField`, `explain`), coverage of your operations (`./coverage`), signed remote rules (`./remote`) and loading from disk (`./bun`). `@softistx/limix-janus` checks relations through janus. `@softistx/limix-publish` signs a rules file, serves the JWKS and ships the `limix-publish` command.
