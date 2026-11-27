# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **1.0 API freeze** — the breaks found by the API review.
- **Flat keys and wildcards** — `"POST /users/:id"` and `"Query.me"` as rule
  keys beside the nested form, a bare `*` in a path, the method `*` and
  `Type.*`. Typed registration and codegen for the flat form follow.

## Next

Nothing yet.

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

- **0.4.0** — one walk in document order for `evaluateRest` and coverage when
  REST patterns overlap; a stale rule an earlier pattern always takes carries
  `shadowedBy`. The [migration guide from `@softistx/security`](migrating-from-security.md)
  ships in the package.
- **0.3.0** — `Register`, the hook a generated file fills to type `definePolicy`
  and the `conditions` of `compilePolicy`.
- **0.2.0** — `holdsPermission(claims)`.
- **0.1.0** (0.1.1 is the same code) — the rules format and evaluation (parse, load, `definePolicy`,
  compile, the JSON schema, `evaluateRest`, `evaluateField`, `explain`, the
  `RelationChecker` port), coverage (`@softistx/limix/coverage`), signed remote
  rules (`@softistx/limix/remote`: `remotePolicy`, `verifyRules`;
  `filePolicyStore` and `loadRules` in `@softistx/limix/bun`), and route
  matching with no `path-to-regexp` or `yaml` dependency. Janus relations ship
  in `@softistx/limix-janus` and the rule publisher in
  `@softistx/limix-publish`, both 0.1.0.
