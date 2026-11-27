# Roadmap

Where `@softistx/limix-graxia` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

Nothing yet.

## Later

Nothing yet.

## Not planned

- **Writing `@needs` from the rules** — `checkNeeds` suggests the directive
  text, never writes it to a schema: the schema stays yours.

## Shipped

- **0.3.0** — `Type.*` rules: a wildcard guards every field of the type that has
  no rule of its own, and the setup check names each non-null field it covers.
- **0.1.0** — a field guard (`guardSchema`), a graxia plugin
  (`limixGraxia`), `checkNeeds` and `canOf` for `@needs`, and `graphqlOperations`
  for coverage.
