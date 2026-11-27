# Roadmap

Where `@softistx/limix-alxia` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **The alxia integration** — a route guard (`limixGuard`) with refusals in the
  app's error format, `alxiaOperations` and `checkRoutes` for coverage and
  setup checks, and `limixGraphql` for a GraphQL endpoint behind the same
  rules. Not published yet.

## Next

- **Publish, with the migration guide** — the first release, and the guide from
  the `policy` part of `@softistx/security`.
  [softistx/limix#11](https://github.com/softistx/limix/issues/11)

## Later

Nothing yet.

## Not planned

- **A tenant option** — the guard keeps one rule set per service; the tenant
  reaches the rules through `claims(ctx)`.
- **A dependency on `@softistx/alxia-access` or `@softistx/alxia-tenancy`** —
  the guard reads their refusals by shape and brings no heavy peers.

## Shipped

Nothing yet.
