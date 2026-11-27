# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

- **graxia integration** — rules on GraphQL fields in a graxia API (`@softistx/limix-graxia`).
- **alxia integration** — rules on HTTP routes, tenants and refusals in an alxia API.
- **Migration from @softistx/security** — a guide from the `policy` part of
  `@softistx/security`.
- **Code generation** — a CLI and a graphql-codegen plugin that type
  `definePolicy` against the API's operations (from the GraphQL schema or the
  OpenAPI spec) and type permission, role and condition names from the rules
  file, plus a starter rules file.

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

- **0.1.0** — the rules format and evaluation (parse, load, `definePolicy`,
  compile, the JSON schema, `evaluateRest`, `evaluateField`, `explain`, the
  `RelationChecker` port), coverage (`@softistx/limix/coverage`), signed remote
  rules (`@softistx/limix/remote`: `remotePolicy`, `verifyRules`;
  `filePolicyStore` and `loadRules` in `@softistx/limix/bun`), and route
  matching with no `path-to-regexp` or `yaml` dependency. Janus relations ship
  in `@softistx/limix-janus` and the rule publisher in
  `@softistx/limix-publish`, both 0.1.0.
