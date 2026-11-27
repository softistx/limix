# Roadmap

Where `@softistx/limix-alxia` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **A tenant option** — the guard keeps one rule set per service; the tenant
  reaches the rules through `claims(ctx)`.
- **A dependency on `@softistx/alxia-access` or `@softistx/alxia-tenancy`** —
  the guard reads their refusals by shape and brings no heavy peers.

## Shipped

- **0.2.0** — several rules files on one app: the innermost `limixGuard` that
  owns a route judges it alone; `checkGuard` names a hook between two guards.
- **0.1.0** — a route guard (`limixGuard`) with refusals in the
  app's error format, `alxiaOperations` and `checkRoutes` for coverage and
  setup checks, and `limixGraphql` for a GraphQL endpoint behind the same
  rules.
