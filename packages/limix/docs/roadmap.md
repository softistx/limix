# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **The rules format and evaluation** — in: parse, load, `definePolicy`, compile,
  the JSON schema, then `evaluateRest`, `evaluateField`, `explain`, the
  `RelationChecker` port and policy sources, then coverage of your operations
  (`@softistx/limix/coverage`: covered, public, uncovered and stale rules over
  a neutral list that integrations supply). Signed remote rules are still
  coming.
- **Janus relations** — relations checked through janus (`@softistx/limix-janus`:
  `janusRelations`, `checkRulesAgainstModel`).

## Next

- **Rule publisher** — sign a rules file and serve the keys that verify it.
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
- **Gateway trust proof** — a proof a gateway has already decided.
- **Rule set per tenant** — one rule set for each tenant.

## Not planned

- **Ory and Keto adapters** — relations go through the relations port; janus is
  the first adapter.

## Shipped

Nothing yet.
