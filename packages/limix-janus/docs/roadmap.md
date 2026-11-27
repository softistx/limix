# Roadmap

Where `@softistx/limix-janus` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

- **Objects with `fromField` relations** — a `load` option that fetches the
  object so janus can read its fields.

## Later

- **Batched checks** — one janus call per rung once janus offers a batched
  `can` (an upstream idea; nothing is filed).

## Not planned

- **Writing relations** — `grant` and `revoke` stay in your janus code.

## Shipped

- **0.1.0** — the adapter: `janusRelations` and `checkModel` over
  janus `can`, tested on the in-memory relation store.
