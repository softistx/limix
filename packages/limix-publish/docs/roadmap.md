# Roadmap

Where `@softistx/limix-publish` is heading. A direction, not a commitment: there
are no dates here, and the version something shipped in is the only number.

## Now

Nothing in progress: the next items are below.

## Next

- **Off `jose`** — move signing and key export to the in-house JWS package
  (softistx/limix#22); the use of `jose` is confined to one module so the swap
  stays local.

## Later

- **Key generation in the command** — `limix-publish keygen`, so a first setup
  needs no `openssl`.
- **A key set from a directory of PEM files** for rotation in CI.

## Not planned

- **Shared-secret algorithms** (`HS256`) — a reader that can verify can also
  forge.
- **A server** — the endpoints are handlers; routing, TLS and storage stay in
  your application.

## Shipped

- **0.1.0** — the emitter: `signRules`, `jwksOf`, `rulesEndpoint`,
  `jwksEndpoint` and the `limix-publish` command (`sign`, `jwks`, `check`),
  tested against the real `remotePolicy` reader.
