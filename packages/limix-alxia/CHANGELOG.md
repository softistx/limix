# @softistx/limix-alxia

## 0.3.0

### Minor Changes

- [#50](https://github.com/softistx/limix/pull/50) [`31b0ed3`](https://github.com/softistx/limix/commit/31b0ed3e3d3171e669fff11ce8698bec3d1c03f8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The 1.0 surface of limix-alxia. Breaking: `checkRoutes(policy, app)` and `checkGuard(guard, app)` return a `readonly RouteIssue[]` (empty means fine) instead of throwing a `TypeError` at the first problem, and name every problem at once; the guard's own start hook still refuses to start, with the same messages. A `RouteIssue` is `{ kind, path, message, fix }`, with `kind` one of `rung-code`, `unmatched-rule`, `open-route` and `separated-guards`. Migration: `expect(() => checkGuard(guard, app)).not.toThrow()` becomes `expect(checkGuard(guard, app)).toEqual([])`, and a `toThrow` on either function reads the issues instead. `LimixGraphqlOptions` is no longer exported from `./graphql` (type a shared object as `LimixGraphqlExtras`, now documented). `Refusal` is core's `Refusal`, re-exported under the same name. Added: `RouteIssue` and `ErrorStatus` types; `MapRefusal<Ctx extends object = Empty>` and `LimixGraphqlExtras<Ctx extends object = Empty>` default to an empty context.

### Patch Changes

- Updated dependencies [[`b4a98ba`](https://github.com/softistx/limix/commit/b4a98ba7ce681cee5c4c10467f041681cc92f87e), [`91b1b87`](https://github.com/softistx/limix/commit/91b1b87a2280287a1c426d5223f6f93debccd644), [`d30f58c`](https://github.com/softistx/limix/commit/d30f58cdfc19c2604fd246e17fc35df5d5673fec)]:
  - @softistx/limix@0.5.0
  - @softistx/limix-graxia@0.2.0

## 0.2.1

### Patch Changes

- [#41](https://github.com/softistx/limix/pull/41) [`35d93c0`](https://github.com/softistx/limix/commit/35d93c016bed2112db44aadfa3b27cdb971c15c9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Coverage and `evaluateRest` resolve overlapping REST patterns by one walk in document order. A `route` is no longer matched exactly before the earlier patterns, so a static rule declared after a param or wildcard rule that takes its path no longer applies to `route` callers, as it never did to `path` callers. Coverage reports such a rule as stale with `shadowedBy`. Fixes [#33](https://github.com/softistx/limix/issues/33).
- Updated dependencies [[`35d93c0`](https://github.com/softistx/limix/commit/35d93c016bed2112db44aadfa3b27cdb971c15c9)]:
  - @softistx/limix@0.4.0
  - @softistx/limix-graxia@0.1.1

## 0.2.0

### Minor Changes

- [#39](https://github.com/softistx/limix/pull/39) [`b1b4460`](https://github.com/softistx/limix/commit/b1b44601a0a5c34b6b3096355f56f5672872a6e5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The innermost guard that owns a route now judges it alone. Until now every `limixGuard` in a route's chain judged it, so an outer guard under `unmatched: 'deny'` refused the routes of a group or prefixed plugin that carried a guard of its own, whatever that guard's rules said. An outer guard now leaves a route to another guard only when that guard comes right after it in the route's chain and the app it was given declares the same route (the hook that follows the outer guard must be the one in that route's own chain) at the same exact path; anything between them (a cache that answers from a store, a middleware) or a plugin mounted under a prefix it does not know means both guards judge, as before. `checkGuard` reports a route with a hook between the two guards (`a hook stands between this guard and the group's guard, so both judge it`): put the group's guard first in the group and `limixGuard` last among the app's own middlewares. Breaking: an outer rule left for a route a group's or plugin's guard judges is no longer taken, so `checkRoutes` throws and the outer guard answers 503 `policy-mismatch`. Move those rules into the group's rules file; `alxiaOperations(group)` lists the routes to cover there. `limixGraphql` endpoints are unchanged: every guard leaves them to their field rules.

## 0.1.0

### Minor Changes

- [#37](https://github.com/softistx/limix/pull/37) [`86149a7`](https://github.com/softistx/limix/commit/86149a74342d506a11889c240bd1acb270d2bd8c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - First published version. `@softistx/limix-graxia` guards the fields of a graxia (graphql-js) schema (`guardSchema`, `limixGraxia`), checks `@needs` against the rules (`checkNeeds`, `canOf`) and lists a schema's operations for coverage (`graphqlOperations`, also alone on `./operations`). `@softistx/limix-alxia` guards the routes of an alxia app (`limixGuard`), lists them for coverage (`alxiaOperations`), checks that the rules fit them (`checkRoutes`, `checkGuard`) and serves a GraphQL endpoint behind the same rules (`limixGraphql` on `./graphql`). `@softistx/limix-codegen` registers the API's operations and the rules file's names in `Register` (the `limix-codegen` command and a graphql-codegen plugin) and writes a starter rules file.

### Patch Changes

- Updated dependencies [[`86149a7`](https://github.com/softistx/limix/commit/86149a74342d506a11889c240bd1acb270d2bd8c)]:
  - @softistx/limix-graxia@0.1.0
