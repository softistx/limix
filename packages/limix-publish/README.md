# @softistx/limix-publish

The emitter side of [`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md)'s
remote rules: it signs a rules file as a JWS, publishes the key set that
verifies it, and serves both, from code or from the `limix-publish` command.
`remotePolicy` from `@softistx/limix/remote` is the reader that pulls what this
package emits.

## Install

The package is published with restricted access: installing it needs an npm
token that can read the `@softistx` scope.

```sh
bun add @softistx/limix-publish @softistx/limix
```

`@softistx/limix` and `typescript` (6 or 7) are required peers. The main entry
uses no `node:` or Bun API, so it runs in a browser or an edge worker; the
`limix-publish` command needs Bun. Your tsconfig resolves as a bundler does
(`"moduleResolution": "bundler"`).

## Usage

| Export | What it is |
| --- | --- |
| `signRules(rules, options)` | Validates the rules as a reader will, signs them as the compact JWS `remotePolicy` pulls. Options: `key`, `alg`, `kid`, `audience`, `ver`, and optionally `issuer`, `expiresIn`, `typ`, `conditions`, `now` |
| `jwksOf(keys)` | The public key set of one or more keys; only the public members are kept |
| `rulesEndpoint({ token, authorize? })` | A fetch-style `(Request) => Promise<Response>` serving the token with an ETag and 304 |
| `jwksEndpoint(jwks, { maxAge? })` | A fetch-style handler serving the key set |
| `importSigningKey(pem, alg)` | A PKCS#8 PEM as the `CryptoKey` `signRules` takes |
| `generateSigningKeyPair(alg)` | A new key pair, for tests and first setups |
| `PublishError`, type `PublishErrorCode` | A key or an option refused; `code` is `KEY` or `OPTIONS` |
| `ALGS`, type `Alg` | `RS256`, `PS256`, `ES256`, `EdDSA`: asymmetric only |
| `DEFAULT_EXPIRES_IN` | The default lifetime, `86400` seconds |
| types `SignRulesOptions`, `JwksKey`, `RulesEndpointOptions`, `JwksEndpointOptions`, `JSONWebKeySet`, `JWK` | The shapes the functions take and return |
| `limix-publish` | The command: `sign`, `jwks`, `check` |

A shared secret (`HS256`, an `oct` key) is refused, as the reader refuses it.
Everything below imports from this package and `@softistx/limix` only.

### Sign

```ts
import { importSigningKey, signRules } from '@softistx/limix-publish'

const key = await importSigningKey(await Bun.file('policy.key.pem').text(), 'ES256')
const token = await signRules(
  { limix: 1, global: { unmatched: 'deny' }, rest: { '/invoices': { GET: { public: true } } } },
  { key, alg: 'ES256', kid: '2026-11', audience: 'billing-api', ver: 12 },
)
```

Invalid rules throw the core's `RulesError`. Details, `conditions` and `exp`:
[Publishing](docs/publishing.md#sign).

### Serve

```ts
import { timingSafeEqual } from 'node:crypto'
import { jwksEndpoint, jwksOf, rulesEndpoint } from '@softistx/limix-publish'

// Schematic: `token` comes from signRules, `publicKey` from your key, `secret` is
// what readers send as authToken.
declare const token: string
declare const publicKey: CryptoKey
declare const secret: string

const same = (a: string, b: string) => {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.byteLength === right.byteLength && timingSafeEqual(left, right)
}

const rules = rulesEndpoint({
  token: () => token,
  authorize: (request) => same(request.headers.get('authorization') ?? '', `Bearer ${secret}`),
})
const keys = jwksEndpoint(await jwksOf([{ key: publicKey, kid: '2026-11', alg: 'ES256' }]))

Bun.serve({
  fetch(request) {
    const { pathname } = new URL(request.url)
    if (pathname === '/rules') return rules(request)
    if (pathname === '/jwks') return keys(request)
    return new Response(null, { status: 404 })
  },
})
```

### JWKS

```ts
import { generateSigningKeyPair, jwksOf } from '@softistx/limix-publish'

const { publicKey } = await generateSigningKeyPair('ES256')
const jwks = await jwksOf([{ key: publicKey, kid: '2026-11', alg: 'ES256' }])
// { keys: [{ kty: 'EC', crv: 'P-256', x, y, kid: '2026-11', alg: 'ES256', use: 'sig' }] }
```

### CLI

```sh
openssl genpkey -algorithm ed25519 -out policy.key.pem
openssl pkey -in policy.key.pem -pubout -out policy.pub.pem

limix-publish sign rules.yaml --key policy.key.pem --kid 2026-11 \
  --aud billing-api --ver 12 --conditions workingHours --out rules.jwt
limix-publish jwks --key policy.pub.pem:2026-11 --out jwks.json
limix-publish check rules.jwt --jwks jwks.json --aud billing-api --conditions workingHours
```

`check` runs `verifyRules` from `@softistx/limix/remote`, the code a reader
runs, so give it the same `--conditions` as `sign` (the names your readers
register); without them a rule that names a condition is refused. It exits 1
with the refusal's code (`SIGNATURE`, `CLAIMS`, `RULES_REFUSED`, `EXPIRED`) and
message. A plain RSA key needs `--alg RS256` or `--alg PS256`.

## More

The [documentation index](docs/README.md): the [publishing guide](docs/publishing.md),
[troubleshooting](docs/troubleshooting.md) and the [roadmap](docs/roadmap.md).
