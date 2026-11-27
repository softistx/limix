# Roadmap

Where `@softistx/limix-codegen` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

Nothing yet.

## Later

- **Typed condition contexts** — field args, route params and body typed per
  operation.

## Not planned

Nothing yet.

## Shipped

- **0.3.0** — `generate` reports the rules that reach no operation of the spec
  (a warning, and a failure under `--check`), `init --flat` writes one key per
  operation, the types check flat keys, and a guide to writing rules.
- **0.1.0** — a CLI (`generate`, `init`) and a graphql-codegen
  plugin that register the API's operations and the rules file's names in
  `@softistx/limix`'s `Register`.
