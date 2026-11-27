# @softistx/limix-publish

## 0.2.1

### Patch Changes

- [#56](https://github.com/softistx/limix/pull/56) [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `limix-publish check` counts REST rules once each, flat keys and method `*` rules included.
- Updated dependencies [[`5ebdc55`](https://github.com/softistx/limix/commit/5ebdc5564ebcc7ece1c7033649857271eefd6155), [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d)]:
  - @softistx/limix@0.6.0

## 0.2.0

### Minor Changes

- [#52](https://github.com/softistx/limix/pull/52) [`72d809d`](https://github.com/softistx/limix/commit/72d809d94589559314b14df58baafcf5b00e5b40) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The 1.0 surface of limix-publish. Breaking: `ALGS` is now `ALGORITHMS` (core's list, re-exported), and `DEFAULT_EXPIRES_IN` is no longer exported (the default stays 86400 seconds, documented). Added: `signRules({ conditions })` also accepts the predicate map a reader registers (`Readonly<Record<string, Condition>>`), and uses its keys; a `string[]` still works.

### Patch Changes

- Updated dependencies [[`b4a98ba`](https://github.com/softistx/limix/commit/b4a98ba7ce681cee5c4c10467f041681cc92f87e)]:
  - @softistx/limix@0.5.0

## 0.1.3

### Patch Changes

- Updated dependencies [[`35d93c0`](https://github.com/softistx/limix/commit/35d93c016bed2112db44aadfa3b27cdb971c15c9)]:
  - @softistx/limix@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`dd6a73f`](https://github.com/softistx/limix/commit/dd6a73f6af019dbb5f88b4a4344be77670a0dbae)]:
  - @softistx/limix@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`5e57f61`](https://github.com/softistx/limix/commit/5e57f616572ad303a5bbe397ab23fa5c849edce0)]:
  - @softistx/limix@0.2.0

## 0.1.0

### Minor Changes

- [#25](https://github.com/softistx/limix/pull/25) [`0308dc1`](https://github.com/softistx/limix/commit/0308dc1dc048bf134bae5148aefafd7086decb24) Thanks [@SteveGT96](https://github.com/SteveGT96)! - First published version. `@softistx/limix` holds the rules format and its evaluation (`definePolicy`, `evaluateRest`, `evaluateField`, `explain`), coverage of your operations (`./coverage`), signed remote rules (`./remote`) and loading from disk (`./bun`). `@softistx/limix-janus` checks relations through janus. `@softistx/limix-publish` signs a rules file, serves the JWKS and ships the `limix-publish` command.

### Patch Changes

- Updated dependencies [[`0308dc1`](https://github.com/softistx/limix/commit/0308dc1dc048bf134bae5148aefafd7086decb24)]:
  - @softistx/limix@0.1.0
