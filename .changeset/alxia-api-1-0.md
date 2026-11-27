---
'@softistx/limix-alxia': minor
---

The 1.0 surface of limix-alxia. Breaking: `checkRoutes(policy, app)` and `checkGuard(guard, app)` return a `readonly RouteIssue[]` (empty means fine) instead of throwing a `TypeError`; the guard's own start hook still refuses to start, with the same messages. A `RouteIssue` is `{ kind, path, message, fix }`, with `kind` one of `rung-code`, `unmatched-rule`, `open-route` and `separated-guards`. Migration: `expect(() => checkGuard(guard, app)).not.toThrow()` becomes `expect(checkGuard(guard, app)).toEqual([])`, and a `toThrow` on either function reads the issues instead. `LimixGraphqlOptions` is no longer exported from `./graphql` (type a shared object as `LimixGraphqlExtras`, now documented). `Refusal` is core's `Refusal`, re-exported under the same name. Added: `RouteIssue` and `ErrorStatus` types; `MapRefusal<Ctx extends object = Empty>` and `LimixGraphqlExtras<Ctx extends object = Empty>` default to an empty context.
