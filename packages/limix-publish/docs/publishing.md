# Publishing rules

`@softistx/limix-publish` produces what `remotePolicy` (from
`@softistx/limix/remote`) pulls: a signed token at one URL and the public keys
that verify it at another. This guide takes you from a key to a running
publisher.

## Generate a key

Keep the private key where only the signer can read it; the public part goes in
the key set. Two algorithms are enough in practice.

```sh
# ES256 (EC P-256)
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -out policy.key.pem
# EdDSA (Ed25519)
openssl genpkey -algorithm ed25519 -out policy.key.pem

openssl pkey -in policy.key.pem -pubout -out policy.pub.pem
```

Both produce a PKCS#8 private key, which `limix-publish sign` and
`importSigningKey` read. A `BEGIN RSA PRIVATE KEY` or `BEGIN EC PRIVATE KEY`
file is refused with the command that converts it
(`openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.p8.pem`). RS256 and PS256 need an RSA key of 2048 bits or more
(`openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072`). HS256 and any
shared secret are refused: whoever can verify a token could forge one.

## Sign

From code, `signRules` validates the rules the way a reader does (`parseRules`,
then `compilePolicy`) before it signs, so a file a reader would refuse never
leaves your machine:

```ts
import { importSigningKey, signRules } from '@softistx/limix-publish'

// Schematic: `rules` is your parsed rules document (see the rules format).
declare const rules: unknown

const key = await importSigningKey(await Bun.file('policy.key.pem').text(), 'EdDSA')

export const token = await signRules(rules, {
  key,
  alg: 'EdDSA',
  kid: '2026-11',
  audience: 'billing-api',
  ver: 12,
  conditions: ['workingHours'], // the names your readers register
})
```

- `ver` is a positive integer that only goes up: a reader refuses a lower one
  (`STALE_VERSION`) and keeps the copy it holds.
- `kid` names the key in the key set; it is required.
- `audience` must contain the reader's `audience`; `issuer` must equal the
  reader's `issuer` when the reader sets one.
- `conditions` lists the predicates the rules' `when` may name. Without it only
  the structure is checked; give it so a typo fails at signing and not on every
  reader. Give `limix-publish check` the same list (`--conditions`), or it
  refuses any rule that names a condition, as a reader with none registered
  would.
- `typ` (default `limix-rules+jwt`) must equal the reader's `typ`; `now` is a
  clock in milliseconds, for tests.

The command does the same from a file:

```sh
limix-publish sign rules.yaml --key policy.key.pem --kid 2026-11 \
  --aud billing-api --iss https://policy.example.com --ver 12 \
  --conditions workingHours --expires 12h --out rules.jwt
```

## Serve

`rulesEndpoint` and `jwksEndpoint` are fetch-style handlers: they take a
`Request` and return a `Response`, so they fit `Bun.serve`, Hono, a worker or a
test. Mount the rules where readers' `rulesUrl` points and the key set at their
`jwksUri`:

```ts
import { timingSafeEqual } from 'node:crypto'
import { jwksEndpoint, jwksOf, rulesEndpoint } from '@softistx/limix-publish'

// Schematic: the signed token and the public key come from your own setup.
declare const currentToken: string
declare const publicKey: CryptoKey

const secret = process.env['RULES_TOKEN'] ?? ''
// Compare secrets in constant time, never with ===.
const same = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}

const jwks = await jwksOf([{ key: publicKey, kid: '2026-11', alg: 'EdDSA' }])
const rules = rulesEndpoint({
  token: () => currentToken, // read per request; may be async
  authorize: (request) =>
    same(request.headers.get('authorization') ?? '', `Bearer ${secret}`),
})
const keys = jwksEndpoint(jwks, { maxAge: 300 })

Bun.serve({
  port: 3000,
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === '/rules') return rules(request)
    if (pathname === '/jwks') return keys(request)
    return new Response(null, { status: 404 })
  },
})
```

The rules endpoint answers `GET` and `HEAD` only (405 otherwise), sends the token
as `application/jwt` with a strong `etag` (the SHA-256 of the token) and
`cache-control: no-cache` (`private, no-cache` when `authorize` is set), and answers 304 to a matching `If-None-Match`, which
is what a reader's poll sends, so an unchanged token costs no body. `authorize`
is yours: the reader sends `authToken` as `Authorization: Bearer`. A refusal is
401; an `authorize` or a token function that throws is 500 or 503 and the
message is never sent. Neither endpoint ever redirects: readers refuse a
redirect so the bearer token never follows one.

Serve both over `https:` (readers accept `http:` only for localhost).

## Rotation

Readers pick the key by the token's `kid`. To rotate without a gap, publish both
keys, switch signing, then retire the old one:

1. Generate the new key. Serve a set with the old and the new public key:
   ```ts
   // Schematic: `oldPublic` and `newPublic` are the two public keys.
   declare const oldPublic: CryptoKey
   declare const newPublic: CryptoKey

   const jwks = await jwksOf([
     { key: oldPublic, kid: '2026-11', alg: 'ES256' },
     { key: newPublic, kid: '2027-02', alg: 'EdDSA' },
   ])
   ```
   Wait for the key set's `max-age` (default 300 s) and for readers' polls, so
   every reader holds both.
2. Sign with the new key and a higher `ver`.
3. After the last token signed with the old key has expired, drop the old key
   from the set.

Keep the `kid` unique: `jwksOf` refuses a duplicate.

## `exp` and the reader's `maxStaleMs`

`expiresIn` (default one day) sets `exp`. A reader keeps serving its last good
copy through an outage until `exp + maxStaleMs` (default 24 hours), then fails
closed: every request is refused with `limix.errors.unavailable`. So the time a
reader survives a dead publisher is `expiresIn + maxStaleMs`.

- A short `expiresIn` (hours) makes a leaked or stale token die sooner, but you
  must re-sign before it ends; re-sign on a schedule well inside it.
- A long one (days) tolerates a publisher outage and a missed job.

Re-signing an unchanged document with the same `ver` is fine for a reader; a new
`ver` is what makes it adopt different rules.

## CI signing

Sign in a pipeline, keep the key in the CI secret store, check what you built,
then publish the token wherever the endpoint reads it (a file, an object store,
a deploy):

```yaml
- run: echo "$POLICY_KEY" > policy.key.pem
  env:
    POLICY_KEY: ${{ secrets.POLICY_KEY }}
- run: >
    bunx limix-publish sign rules.yaml --key policy.key.pem --kid 2026-11
    --aud billing-api --ver ${{ github.run_number }} --conditions workingHours
    --expires 7d --out rules.jwt
- run: >
    bunx limix-publish check rules.jwt --jwks jwks.json --aud billing-api
    --conditions workingHours
```

`github.run_number` only goes up. Give `check` the same `--conditions` as
`sign`. `check` verifies with `verifyRules`, the same
code readers run, and exits 1 with the code and message of a refusal, also for an
expired token, so a pipeline stops before it publishes a token no reader would
accept.
