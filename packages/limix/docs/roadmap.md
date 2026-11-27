# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

- **Migration guide on npm** — the [migration guide from
  `@softistx/security`](migrating-from-security.md) is in the repository's docs;
  it reaches the npm page with the next `@softistx/limix` release.

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

- **0.3.0** — `Register`, the hook a generated file fills to type `definePolicy`
  and the `conditions` of `compilePolicy`. The integrations ship as
  `@softistx/limix-graxia`, `@softistx/limix-alxia` and `@softistx/limix-codegen`
  0.1.0.
- **0.2.0** — `holdsPermission(claims)`.
- **0.1.0** (0.1.1 is the same code) — the rules format and evaluation (parse, load, `definePolicy`,
  compile, the JSON schema, `evaluateRest`, `evaluateField`, `explain`, the
  `RelationChecker` port), coverage (`@softistx/limix/coverage`), signed remote
  rules (`@softistx/limix/remote`: `remotePolicy`, `verifyRules`;
  `filePolicyStore` and `loadRules` in `@softistx/limix/bun`), and route
  matching with no `path-to-regexp` or `yaml` dependency. Janus relations ship
  in `@softistx/limix-janus` and the rule publisher in
  `@softistx/limix-publish`, both 0.1.0.
