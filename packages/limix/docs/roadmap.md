# Roadmap

Where `@softistx/limix` is heading. A direction, not a commitment: there are no
dates here, and the version something shipped in is the only number.

## Now

- **Policy engine for REST and GraphQL** — the core is in progress: a rules
  format, their evaluation, a relations port, coverage of your operations and
  signed remote rules. The only shipped surface today is the format version.

## Next

- **Janus relations** — relations checked through janus.
- **Rule publisher** — sign a rules file and serve the keys that verify it.
- **graxia integration** — rules on GraphQL fields in a graxia API.
- **alxia integration** — rules on HTTP routes, tenants and refusals in an alxia API.
- **Migration from @softistx/security** — a guide from the `policy` part of
  `@softistx/security`.

## Later

- **Rules editor** — a type-safe editor for rules, built on `@softistx/material`.
- **Restricted profile** — a stricter profile for rules.
- **Gateway trust proof** — a proof a gateway has already decided.
- **Rule set per tenant** — one rule set for each tenant.

## Not planned

- **Ory and Keto adapters** — relations go through the relations port; janus is
  the first adapter.

## Shipped

Nothing yet.
