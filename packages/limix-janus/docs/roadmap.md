# Roadmap

Where `@softistx/limix-janus` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

- **The adapter** — in: `janusRelations` and `checkRulesAgainstModel` over
  janus `can`, tested on the in-memory relation store.

## Next

- **Objects with `fromField` relations** — a `load` option that fetches the
  object so janus can read its fields.

## Later

- **Batched checks** — one janus call per rung once janus offers a batched
  `can` (an upstream idea; nothing is filed).

## Not planned

- **Writing relations** — `grant` and `revoke` stay in your janus code.

## Shipped

Nothing yet.
