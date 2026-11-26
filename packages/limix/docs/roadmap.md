# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **The rules format** — in: parse, load, `definePolicy`, compile and the JSON
  schema. Evaluation, coverage of your operations, relations and signed remote
  rules are still coming.

## Next

- **Janus relations** — relations checked through janus.
- **Rule publisher** — sign a rules file and serve the keys that verify it.
- **graxia integration** — rules on GraphQL fields in a graxia API.
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
