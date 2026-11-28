# @softistx/limix-graxia

## 0.3.3

### Patch Changes

- [#72](https://github.com/softistx/limix/pull/72) [`d5aee5b`](https://github.com/softistx/limix/commit/d5aee5bca556381db227c54ab0b788db8f144f91) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Tested against graxia 0.20 and janus 0.85; peer ranges unchanged.

## 0.3.2

### Patch Changes

- Updated dependencies [[`53b7ca5`](https://github.com/softistx/limix/commit/53b7ca51804ca357c033eec94a8356d7a64141f7)]:
  - @softistx/limix@0.8.0

## 0.3.1

### Patch Changes

- Updated dependencies [[`1c2ea26`](https://github.com/softistx/limix/commit/1c2ea26efe7d27cc549d8621d812a1e0165f3a78)]:
  - @softistx/limix@0.7.0

## 0.3.0

### Minor Changes

- [#56](https://github.com/softistx/limix/pull/56) [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A `Type.*` rule guards every field of the type that has no rule of its own, root or not: `entryOf` falls back to the wildcard, so such a field is wrapped instead of left open. Under `nonNull: 'refuse'` the setup check names each non-null field a wildcard covers. Needs `@softistx/limix` with flat keys and wildcards.

### Patch Changes

- Updated dependencies [[`5ebdc55`](https://github.com/softistx/limix/commit/5ebdc5564ebcc7ece1c7033649857271eefd6155), [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d)]:
  - @softistx/limix@0.6.0

## 0.2.0

### Minor Changes

- [#48](https://github.com/softistx/limix/pull/48) [`91b1b87`](https://github.com/softistx/limix/commit/91b1b87a2280287a1c426d5223f6f93debccd644) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The 1.0 surface of limix-graxia. Breaking: `refusalError(refusal, mapRefusal?, at?, topLevel?)` is now `refusalError(refusal, { mapRefusal?, at?, topLevel? })`; the first parameter of `MapRefusal` is core's structural `Refusal` instead of `LimixRefusal` (an unannotated mapper keeps compiling; one that annotates its parameter `LimixRefusal` changes it to `Refusal`, or narrows with `isLimixRefusal`); `LimixGraxiaOptions` and `guardSchema` take `<Ctx extends object = Empty>`, so a bare `LimixGraxiaOptions` means an empty context instead of any context. Added: the `RefusalErrorOptions` type.

- [#53](https://github.com/softistx/limix/pull/53) [`d30f58c`](https://github.com/softistx/limix/commit/d30f58cdfc19c2604fd246e17fc35df5d5673fec) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `checkNeeds` and `checkModel` return a `readonly` issue array, like `checkRoutes` and `checkGuard`.

### Patch Changes

- Updated dependencies [[`b4a98ba`](https://github.com/softistx/limix/commit/b4a98ba7ce681cee5c4c10467f041681cc92f87e)]:
  - @softistx/limix@0.5.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`35d93c0`](https://github.com/softistx/limix/commit/35d93c016bed2112db44aadfa3b27cdb971c15c9)]:
  - @softistx/limix@0.4.0

## 0.1.0

### Minor Changes

- [#37](https://github.com/softistx/limix/pull/37) [`86149a7`](https://github.com/softistx/limix/commit/86149a74342d506a11889c240bd1acb270d2bd8c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - First published version. `@softistx/limix-graxia` guards the fields of a graxia (graphql-js) schema (`guardSchema`, `limixGraxia`), checks `@needs` against the rules (`checkNeeds`, `canOf`) and lists a schema's operations for coverage (`graphqlOperations`, also alone on `./operations`). `@softistx/limix-alxia` guards the routes of an alxia app (`limixGuard`), lists them for coverage (`alxiaOperations`), checks that the rules fit them (`checkRoutes`, `checkGuard`) and serves a GraphQL endpoint behind the same rules (`limixGraphql` on `./graphql`). `@softistx/limix-codegen` registers the API's operations and the rules file's names in `Register` (the `limix-codegen` command and a graphql-codegen plugin) and writes a starter rules file.
