# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **alxia integration** — rules on HTTP routes in an alxia API
  (`@softistx/limix-alxia`): a route guard with refusals in the app's error
  format, `alxiaOperations` and `checkRoutes`, and a GraphQL endpoint behind
  the same rules. Not published yet.
- **graxia integration** — rules on GraphQL fields in a graxia API (`@softistx/limix-graxia`): a field guard, a graxia plugin, `@needs` checks and coverage operations.

- **Code generation** — `Register`, and `@softistx/limix-codegen` (a CLI and a
  graphql-codegen plugin) that types `definePolicy` against the API's operations
  (GraphQL schema, OpenAPI spec) and the permission, role and condition names of
  the rules file, plus a starter rules file. `Register` ships with the next
  minor; the generator is not published yet.

## Next

- **Migration from @softistx/security** — a guide from the `policy` part of
  `@softistx/security`.
## Later

- **Typed condition contexts** — field args, route params and body typed per
  operation.
- **Rules editor** — a type-safe editor for rules, built on `@softistx/material`.
- **Restricted profile** — a stricter profile for rules.
- **Live key pinning** — verify live pulls against a local key set.
- **A bounded `ready`** — a ready promise that rejects after a timeout.
- **Gateway trust proof** — a proof a gateway has already decided.
- **Rule set per tenant** — one rule set for each tenant.

## Not planned

- **Ory and Keto adapters** — relations go through the relations port; janus is
  the first adapter.

## Shipped

- **0.1.0** (0.1.1 is the same code) — the rules format and evaluation (parse, load, `definePolicy`,
  compile, the JSON schema, `evaluateRest`, `evaluateField`, `explain`, the
  `RelationChecker` port), coverage (`@softistx/limix/coverage`), signed remote
  rules (`@softistx/limix/remote`: `remotePolicy`, `verifyRules`;
  `filePolicyStore` and `loadRules` in `@softistx/limix/bun`), and route
  matching with no `path-to-regexp` or `yaml` dependency. Janus relations ship
  in `@softistx/limix-janus` and the rule publisher in
  `@softistx/limix-publish`, both 0.1.0.
