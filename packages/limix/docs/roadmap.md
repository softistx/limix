# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **The rules format and evaluation** — in: parse, load, `definePolicy`, compile,
  the JSON schema, then `evaluateRest`, `evaluateField`, `explain`, the
  `RelationChecker` port and policy sources, then coverage of your operations
  (`@softistx/limix/coverage`: covered, public, uncovered and stale rules over
  a neutral list that integrations supply), then signed remote rules
  (`@softistx/limix/remote`: `remotePolicy` pulls a signed JWS, verifies it
  against the publisher's JWKS, hot-swaps it and keeps the last good copy
  through an outage; `filePolicyStore` in `@softistx/limix/bun`).
- **Fewer dependencies** — route matching and rules loading no longer pull in
  `path-to-regexp` or `yaml`: a pattern compiles to one regular expression of
  limix's own, `loadRules` reads with `Bun.file` and `Bun.YAML`, and the
  `./node` subpath is now `./bun`. `jose` stays until a framework-free JWS
  package can replace it in `./remote`.
- **Rule publisher** — sign a rules file and serve the keys that verify it
  (`@softistx/limix-publish`: `signRules`, `jwksOf`, the endpoints and the
  `limix-publish` command); `verifyRules` in `@softistx/limix/remote` is the
  check the command shares with `remotePolicy`.
- **Janus relations** — relations checked through janus (`@softistx/limix-janus`:
  `janusRelations`, `checkRulesAgainstModel`).

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

Nothing yet.
