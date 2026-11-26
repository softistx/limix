# Remote rules

`remotePolicy()` from `@softistx/limix/remote` pulls the rules a policy server
publishes, verifies them, and returns a [`PolicySource`](evaluation.md) that the
evaluators take directly. A new `ver` applies to the next request with no
restart; a publisher outage keeps the last good copy serving.

It uses the global `fetch` and [`jose`](https://github.com/panva/jose) only, so
it runs in Node, Bun, a browser or an edge runtime. The floor is
`AbortSignal.any`: Node 20.3 or later, Bun, Deno, Cloudflare Workers, Chrome
116, Firefox 124 and Safari 17.4. The one Bun-only part, a
file that keeps the last good copy across a restart, is `filePolicyStore` in
`@softistx/limix/bun`.

## A first source

```ts
import { evaluateRest } from '@softistx/limix'
import { remotePolicy } from '@softistx/limix/remote'

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  issuer: 'https://policy.example.com',
  conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
})

const decision = await evaluateRest(policy, {
  method: 'GET',
  path: '/invoices',
  claims: { authenticated: true },
})
```

While the source holds nothing (before the first pull, past `maxStaleMs`),
`evaluateRest` and `evaluateField` refuse every request with
`limix.errors.unavailable` (503). Nothing falls back to allow.

## The token

The response body is a compact JWS with:

- header `typ` equal to the `typ` option, default `limix-rules+jwt`, and an
  asymmetric `alg`: RS256, PS256, ES256 or EdDSA. HS256 and the other
  shared-secret algorithms are refused, even when the key set advertises an
  `oct` key;
- `aud` containing your `audience`; `iss` equal to `issuer` whenever you gave
  `issuer`; `iat` and `exp` (both required), `nbf` honoured;
- a positive integer `ver`, and `rules`, the rules document
  ([format](rules.md)), which must carry `limix: 1`;
- optionally `schema`, the rules format version the publisher wrote. When
  present it must equal `LIMIX_FORMAT_VERSION` (`1`); anything else is refused
  as `CLAIMS`, so a publisher on a newer format never hands this build rules it
  would misread.

The `rules` claim goes through `parseRules` and `compilePolicy`, with the
`conditions` option. A rule that names a condition you did not register is
refused: a remote file carries no code, only the names of predicates your
service registers.

Keys come from `jwksUri` when given. Otherwise they come from the `jwks_uri` of
`${issuer}/.well-known/openid-configuration`, read once; that document's
`issuer` must equal yours or the pull fails with `FETCH_FAILED`. Give both and
discovery is skipped while `iss` is still checked. `rulesUrl`, `jwksUri` and
`issuer` must be `https:`; `http:` is accepted only for `localhost`,
`127.0.0.1` and `::1`.

Live pulls are always verified against that key set. A pull, a discovery and a
key fetch are made with `redirect: 'error'`: a 3xx is refused (`FETCH_FAILED`
or `HTTP_STATUS`), so `Authorization: Bearer <authToken>` never follows a
redirect to another origin or to `http:`.

## Verifying a token you hold

`verifyRules(jws, jwks, options)` runs the checks a pull makes (asymmetric
`alg`, `typ`, `aud`, `iss`, `iat` and `exp` required, `schema`, the rules
compiled with `conditions`) against a key set you already hold, without a
network. It is what `limix-publish check` uses
([`@softistx/limix-publish`](https://github.com/softistx/limix/blob/develop/packages/limix-publish/README.md)), so a publisher's
check and its readers agree. A token past its `exp` is returned with
`expired: true`; a refusal is a `RemotePolicyError` (`SIGNATURE`, `CLAIMS` or
`RULES_REFUSED`), and a key set that is not a valid JWKS is `SIGNATURE`.

Options: `audience` (required), `issuer`, `typ` (default `DEFAULT_TYP`,
`limix-rules+jwt`), `conditions` (default none: a rule naming a condition is
refused) and `now` (milliseconds, default `Date.now`). `ALGORITHMS`, exported
beside it, lists the four algorithms a token may use.

```ts
import { verifyRules } from '@softistx/limix/remote'

// Schematic: `token` is the compact JWS, `jwks` the publisher's key set.
declare const token: string
declare const jwks: { keys: object[] }

const { ver, exp, expired, policy } = await verifyRules(token, jwks, {
  audience: 'billing-api',
  issuer: 'https://policy.example.com', // optional
  conditions: { workingHours: () => true }, // the names the rules' `when` may use
})
```

## Polling and the last good copy

A pull sends `If-None-Match` with the held ETag. A 304 keeps the rules and
resets `age()`. Then:

| The pull brings | What happens |
| --- | --- |
| A higher `ver` | The rules are swapped in; subscribers, then `onChange`, are told |
| A lower `ver` | Refused (`STALE_VERSION`): a rollback |
| The held `ver` with identical rules (a re-signing) | The held token and `age()` are refreshed |
| The held `ver` with other rules | Refused (`CLAIMS`): the publisher must bump `ver` |
| A bad signature, `typ`, `aud`, `iss`, `exp` or `schema` | Refused (`SIGNATURE` or `CLAIMS`) |
| Rules `parseRules` or `compilePolicy` refuses (a `RulesError`) | Refused (`RULES_REFUSED`) |
| A network error, a non-200, a timeout | `FETCH_FAILED` or `HTTP_STATUS` |

A refused or failed pull keeps serving the last good rules, logs, and calls
`onError`. Only `EXPIRED` (a held copy more than `maxStaleMs` past its `exp`) and
a restored copy the live keys refuse withdraw the rules, and subscribers then
hear `null`. A pull longer than `timeoutMs` (default 10 s), a hung `authToken`
function and a hung key fetch are aborted; a response larger than 1 MiB is
refused (`TOO_LARGE`). `stop()` clears the timer and aborts the pull in flight.

Schematic: `getServiceToken` and `metrics` stand for your own code.

```ts
import { remotePolicy } from '@softistx/limix/remote'

declare function getServiceToken(): Promise<string>
declare const metrics: { increment(name: string, tags: object): void }

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  jwksUri: 'https://policy.example.com/jwks',
  intervalMs: 30_000,
  maxStaleMs: 6 * 3_600_000,
  authToken: async () => await getServiceToken(),
  logger: console,
  onChange: ({ ver, previousVer }) => console.log('rules', previousVer, '->', ver),
  onError: (error) => metrics.increment('policy_pull_failed', { code: error.code }),
})

setInterval(() => {
  const age = policy.age() // null until a policy is held
  if (age !== null && age > 10 * 60_000) console.warn('policy is stale', { age })
}, 60_000)
```

Nothing is logged unless you pass a `logger` (`info`, `warn`, `error`).

## Startup

Before the first success `current()` is `null` and `ready` stays pending. It
never rejects, so on a first boot with nothing valid to hold (publisher down, no
store) `await policy.ready` can wait forever. Bound it to refuse to start
rather than answer 503:

```ts
import { remotePolicy } from '@softistx/limix/remote'

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  issuer: 'https://policy.example.com',
})

const held = await Promise.race([
  policy.ready.then(() => true),
  new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 15_000)),
])
if (!held) throw new Error('no policy within 15 s')
```

## Surviving a restart

```ts
import { remotePolicy } from '@softistx/limix/remote'
import { filePolicyStore } from '@softistx/limix/bun'

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  issuer: 'https://policy.example.com',
  store: filePolicyStore('./policy.json'),
  trustedKeys: ['<JWK thumbprint of the publisher key>'],
})
```

With a `store`, the source reads the saved token and key set at start, verifies
them offline and holds the policy before any network call, then pulls. After
every accepted change it writes the token and the key set that verified it.
`filePolicyStore` writes with mode `0600`; keep the file where only the service
reads it. Any `PolicyStore` (`read()` and `write(value)`) works, a Redis key for
instance (see [a custom store](#a-custom-store)).

The store is trusted like the code, since it carries its own key set. What
bounds the damage:

- A restored copy is provisional: it serves, but sets no `ver` floor and is
  never confirmed by a 304. Once the live keys load it is verified against
  them: accepted, its `ver` becomes the floor; refused, it is dropped (`STORE`).
- `trustedKeys` (JWK thumbprints) pins only the keys a stored key set may hold, never the live verification, which uses the publisher's key set; a
  stored copy with any other key is ignored (`STORE`). Set it when you know the
  publisher's keys.
- `maxStaleMs` (default 24 h) bounds how far past `exp` a copy is served, at
  start and on every `current()`. Up to the bound an expired copy is last known
  good and logged as a warning, since a publisher outage must not take the
  service down; beyond it the service fails closed. `Infinity` never refuses.

The `ver` floor comes only from live-verified tokens and survives a withdrawal,
so after a copy expires an older, still-unexpired token is refused as
`STALE_VERSION`.

### A custom store

A `PolicyStore` has `read()`, which gives back what was written or `null`, and
`write(value)`. A `StoredPolicy` is `{ jws, jwks, etag? }`: the compact token,
the key set that verified it and the ETag, when the publisher sent one. The
client below is schematic; any Redis library with `get` and `set` fits.

```ts
import {
  remotePolicy,
  type PolicyStore,
  type StoredPolicy,
} from '@softistx/limix/remote'

declare const redis: {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<unknown>
}

const store: PolicyStore = {
  async read() {
    const text = await redis.get('limix:policy')
    return text ? (JSON.parse(text) as StoredPolicy) : null
  },
  async write(value) {
    await redis.set('limix:policy', JSON.stringify(value))
  },
}

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  issuer: 'https://policy.example.com',
  store,
})
```

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `rulesUrl` | required | Where the signed rules are pulled from |
| `audience` | required | Required `aud` |
| `typ` | `limix-rules+jwt` | Required `typ` header |
| `jwksUri`, `issuer` | one of them | Where keys come from; `issuer` is also checked as `iss` |
| `conditions` | none | The predicates a rule's `when` may name |
| `trustedKeys` | none | JWK thumbprints a stored key set may hold |
| `timeoutMs` | 10 000 | Per pull, discovery, key fetch and store read |
| `intervalMs` | 60 000 | Poll period |
| `maxStaleMs` | 86 400 000 | How far past `exp` a copy still serves |
| `authToken` | none | Sent as `Authorization: Bearer`; a function is called on every pull |
| `store` | none | Keeps the last good copy across a restart |
| `logger`, `onChange`, `onError` | no log | See above |
| `fetch`, `now` | global `fetch`, `Date.now` | Replaced in tests |

The returned source adds `ready`, `refresh()` (true when the rules changed;
never throws), `stop()`, `age()` and `version()`. Every `RemotePolicyError` has
a `code`: `FETCH_FAILED`, `HTTP_STATUS`, `SIGNATURE`, `CLAIMS`, `STALE_VERSION`,
`RULES_REFUSED`, `STORE`, `EXPIRED` or `TOO_LARGE`; see
[troubleshooting](troubleshooting.md).

## Errors

A failed pull is a `RemotePolicyError`; a refused option is a
`RemotePolicyConfigError` (a `TypeError`), thrown by `remotePolicy()` at
construction, for instance when neither `jwksUri` nor `issuer` is given.
`DEFAULT_TYP` is the default `typ`, `'limix-rules+jwt'`.

```ts
import {
  DEFAULT_TYP,
  RemotePolicyConfigError,
  RemotePolicyError,
  remotePolicy,
} from '@softistx/limix/remote'

try {
  const policy = remotePolicy({
    rulesUrl: 'https://policy.example.com/rules',
    audience: 'billing-api',
    jwksUri: 'https://policy.example.com/jwks',
    typ: DEFAULT_TYP,
    onError: (error) => {
      if (error instanceof RemotePolicyError && error.code === 'SIGNATURE') {
        console.error('the publisher signed with an unknown key', error.message)
      }
    },
  })
  const changed = await policy.refresh() // never throws
  console.log(changed)
} catch (error) {
  if (error instanceof RemotePolicyConfigError) console.error(error.message)
  else throw error
}
```

## Testing without a network

Pass `fetch` and sign with `jose`; the package's own specs do exactly that
(`src/remote/publisher.fixtures.ts`):

```ts
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { remotePolicy } from '@softistx/limix/remote'

// Schematic: the rules document the publisher would sign.
const rules = {
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/invoices': { GET: { public: true } } },
}

const { publicKey, privateKey } = await generateKeyPair('ES256')
const jwks = { keys: [{ ...(await exportJWK(publicKey)), kid: 'k1', alg: 'ES256' }] }
const now = Math.floor(Date.now() / 1000)
const jws = await new SignJWT({ ver: 1, schema: 1, rules })
  .setProtectedHeader({ alg: 'ES256', typ: 'limix-rules+jwt', kid: 'k1' })
  .setAudience('billing-api').setIssuedAt(now).setExpirationTime(now + 3600)
  .sign(privateKey)

const policy = remotePolicy({
  rulesUrl: 'https://policy.test/rules',
  jwksUri: 'https://policy.test/jwks',
  audience: 'billing-api',
  fetch: (async (input: RequestInfo | URL) =>
    String(input).endsWith('/jwks')
      ? Response.json(jwks)
      : new Response(jws)) as typeof fetch,
})
await policy.refresh()
```
