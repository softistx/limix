# @softistx/limix

## 0.7.0

### Minor Changes

- [#61](https://github.com/softistx/limix/pull/61) [`1c2ea26`](https://github.com/softistx/limix/commit/1c2ea26efe7d27cc549d8621d812a1e0165f3a78) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The rules format is nested only again, and `definePolicy` is where flat keys and typed rule bodies live (breaking, 0.7).
  
  - A flat key (`"POST /users/:id"`, `"Query.me"`, `"Note.*"`, `"* /admin/*"`) in a rules document is refused by `parseRules`, `loadRules` and `compilePolicy`, with the nested spelling to write: `` `POST /users/:id` is a definePolicy key; in a rules file write "/users/:id": { POST: … } ``. Wildcards stay in their nested spelling: a bare `*` in a path, the method `"*"` under a path, the field `"*"` under a type. `schema/rules.schema.json` refuses the flat keys too. `RulesInput` is removed: `compilePolicy` takes a `Rules`, and `Rules['rest']` is `Record<string, RestMethods>` again.
  - `definePolicy` still takes flat keys, beside nested ones. It nests them in document order (a flat rule joins an earlier key of its path), refuses a move that would jump over a rule that could answer the same request (same method, a `*` rule, or a `GET`/`HEAD` pair) with ``` `GET /a` would move above `GET /b`: nest it under `/a`, or write `/b` after it ```, refuses a rule written twice, and then validates the document as `parseRules` does. What it returns is that canonical nested `Rules`: `rules.rest['GET /x']` is `undefined` now, `rules.rest['/x'].GET` holds the rule, and an invalid document throws a `RulesError` at run time (it used to return its argument unvalidated).
  - Rule bodies are typed. `roles`, `permissions` and `when` are narrowed to the names a program declares in `Register` (`role`, `permission`, `condition`), and `definePolicy(rules, { conditions })` (or `definePolicy<typeof conditions>(rules)`) narrows `when` to the keys of the conditions you also give to `compilePolicy`; `definePolicy` only reads their keys and never calls one. New type `DefinePolicyOptions`. `TypedRules` and `TypedRulesInput` take the condition names as a second parameter. The lists are mutable: a body written `as const` is refused once names are declared.
  
  Migration:
  
  - A rules file with flat keys (written for 0.6): nest them, or move the document into `definePolicy`. A remote token signed on 0.6 with flat keys: re-sign it **nested first** (a 0.6 client accepts nested keys), then upgrade the clients. A 0.7 client refuses a flat token (`RULES_REFUSED`) and keeps serving its held copy, but a client that restarts re-verifies its stored 0.6 copy, refuses it (`STORE`) and has no policy until a nested token is published: it fails closed.
  - Code that read `rules.rest[...]` or `rules.graphql[...]` of a `definePolicy` result by a flat key: read the nested key. Code that named `RulesInput`: use `Rules`, or `TypedRulesInput` for what `definePolicy` takes.
  - Issue paths and `where` (`CompiledRestRoute.where`, coverage and `checkModel` paths) of a flat-written rule name its nested place once `definePolicy` has run (`rest['/a'].POST`). Errors raised by `definePolicy` itself name the key as written (`rest['POST /a'].roles[0]`).
  - A test that called `definePolicy` with an invalid document and relied on it returning the argument: it throws now.
  - `limix-codegen` 0.4 no longer generates `permission`, `role` and `condition` in `Register`: declare them by hand (see the typed operations section of the rules guide).

## 0.6.0

### Minor Changes

- [#58](https://github.com/softistx/limix/pull/58) [`5ebdc55`](https://github.com/softistx/limix/commit/5ebdc5564ebcc7ece1c7033649857271eefd6155) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `definePolicy` checks flat keys against the operations a generated file registers: `"GET /notes"` and `"Query.me"` must be registered operations and `"Note.*"` needs a registered type, as the nested spelling already did. The method `*` and the field `*` are accepted under a registered path or type. A key with a wildcard or an optional group stays unchecked. The new `TypedRulesInput` type is what `definePolicy` takes; `TypedRules` is unchanged and every `TypedRules` value is a `TypedRulesInput`. One inline literal is now refused: a flat key holding a method map (`'GET /files/*path': { GET: rule }`), which `parseRules` already refused. `RulesInput` is still what `compilePolicy` takes.
  
  `compilePolicy` refuses a rule that carries a key which is no rule term (`roles`, `permissions`, `relations`, `when`, `authenticated`, `public`), such as a method map under a flat key reached through a variable or a spread. It used to compile to a rule with no requirement, which allowed every caller. Fix the rule: put its terms under the key, or nest it under a path or a type.

- [#56](https://github.com/softistx/limix/pull/56) [`eb52f89`](https://github.com/softistx/limix/commit/eb52f898f37a011c39bc955203969ff39b80873d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Rules may be written with flat keys, `"POST /users/:id"` under `rest` and `"Query.me"` under `graphql`, beside the nested spelling and mixed with it; every rule keeps the place of its key in document order. A bare `*` ends a path pattern (the rest of the path, nothing captured), the method `*` stands for any method (an exact method wins on the same pattern) and `Type.*` stands for every field of a type that has no rule of its own. Coverage reports `match: 'wildcard'` and `summary.byWildcard`, and reads a wildcard name as no part of a spelling (`GET /a/*` is the rule of the operation `GET /a/*path`). `CompiledPolicy` gains `restRoutes` (each rule once, in document order), `CompiledRestRoute` a `method` and a `where`, `CompiledGraphqlEntry` a `where` and a `wildcard`. `definePolicy` and `compilePolicy` take a `RulesInput`, which also accepts flat `graphql` keys; `Rules` keeps its earlier shape.
  
  Behaviour changes to know when upgrading:
  
  - A pattern named twice is now a compile error: `/a` and `/a/` with the same method are one rule written twice, and so are a flat key and a nested one naming the same method and pattern.
  - A key under `rest` shaped `WORD /x` that is not a method in capitals followed by one space (`get /x`, `GET  /x`) is refused instead of read as a path; a path that holds a space starts with `/`.
  - A rule written straight under a path pattern, or a method map under a flat key, is refused by `compilePolicy`.

## 0.5.0

### Minor Changes

- [#46](https://github.com/softistx/limix/pull/46) [`b4a98ba`](https://github.com/softistx/limix/commit/b4a98ba7ce681cee5c4c10467f041681cc92f87e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The 1.0 surface of the core. Breaking: `OUTAGE_MESSAGE`, `POLICY_SOURCE`, `LIMIX_REFUSAL`, `DEFAULT_FROM` and `DEFAULT_ON_DENY` are no longer exported (the contract between copies is the `Symbol.for('limix.policy-source')` and `Symbol.for('limix.refusal')` registry keys); `CompiledPolicy`, `CompiledRestRoute` and `CompiledGraphqlEntry` are readonly all the way down (only `global` and `usesRelations` are for hosts); `RemotePolicy.refresh()` answers `{ changed, error? }` instead of a boolean; `rulesPathOf` now quotes and escapes as `limix-codegen`'s `openapiPath` did (`{id}.json` becomes `:id.json`) and throws a `TypeError` for a path with no limix spelling. Added: the `Refusal` interface, `JSONWebKeySet` from `/remote`, and an explicit `Rules` type held equal to the schema's inference by a type test.

## 0.4.0

### Minor Changes

- [#41](https://github.com/softistx/limix/pull/41) [`35d93c0`](https://github.com/softistx/limix/commit/35d93c016bed2112db44aadfa3b27cdb971c15c9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Coverage and `evaluateRest` resolve overlapping REST patterns by one walk in document order. A `route` is no longer matched exactly before the earlier patterns, so a static rule declared after a param or wildcard rule that takes its path no longer applies to `route` callers, as it never did to `path` callers. Coverage reports such a rule as stale with `shadowedBy`. Fixes [#33](https://github.com/softistx/limix/issues/33).

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
