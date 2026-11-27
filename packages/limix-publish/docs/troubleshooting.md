# Troubleshooting `@softistx/limix-publish`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies. A rules error comes from
`@softistx/limix` (see its troubleshooting); the reader's refusals
(`SIGNATURE`, `CLAIMS`, `RULES_REFUSED`) are in
[`@softistx/limix`'s troubleshooting](https://github.com/softistx/limix/blob/develop/packages/limix/docs/troubleshooting.md).

## alg "<alg>" is not allowed: use RS256, PS256, ES256, EdDSA (asymmetric only; a shared secret cannot tell a publisher from a reader)

`alg` is `HS256` or another shared-secret algorithm. Readers refuse those. Use
an asymmetric key and one of the four algorithms.

## `kid` must be a non-empty string

`signRules` and `jwksOf` need a `kid`, so a reader can pick the key. Give each
key its own, such as a date: `kid: '2026-11'`.

## `ver` must be a positive integer, got <value>

`ver` is 1, 2, 3 and so on, never 0 or a fraction, and only goes up. From a CI
use a counter: `--ver ${{ github.run_number }}`.

## `expiresIn` must be a positive integer, got <value>

`expiresIn` is in seconds. For `limix-publish sign` give `--expires 3600`,
`30m`, `12h` or `7d`.

## `audience` must be a non-empty string or a list of them

Give the `audience` your readers set in `remotePolicy`.

## `issuer` must not be empty

Leave `issuer` out, or give the URL readers require as `issuer`.

## `typ` must not be empty

Leave `typ` out (it defaults to `limix-rules+jwt`) or give the one your readers
set.

## `key` must be a CryptoKey (import a PKCS#8 PEM with importPKCS8, or generate a pair)

`signRules` takes a `CryptoKey`, not a PEM string, a Buffer or a KeyObject.
Import the PEM, or generate a pair for a test:

```ts
import { importSigningKey } from '@softistx/limix-publish'


const key = await importSigningKey(pem, 'ES256')
```

## a shared secret (<algorithm>) cannot sign rules: use an asymmetric private key (RS256, PS256, ES256, EdDSA)

The key is an HMAC or another secret key. Generate an EC P-256, Ed25519 or RSA
key (see [Publishing](publishing.md)).

## the key is <found>, which does not fit <alg>: <alg> needs <kind>

The key does not suit the algorithm: ES256 needs EC P-256, EdDSA Ed25519,
RS256 and PS256 an RSA key of 2048 bits or more. Pass the `alg` that matches the
key (the command infers it when `--alg` is left out). An EC key on P-384 is
refused: only P-256.

## signing needs the private key, not the public

You gave `signRules` the public half. Import the PKCS#8 file.

## the key cannot sign (its usages lack "sign")

The key was imported for verifying only. Import the private key.

## key "<kid>" cannot be exported (not extractable): give its public key, or import it with extractable: true

`jwksOf` was given a private `CryptoKey` that the runtime will not export. Give
it the public key (`generateKeyPair` returns both), or the public JWK.

## key "<kid>" must be a CryptoKey or a JWK

`jwksOf` takes a `CryptoKey` or a JWK object, not a PEM string. From a PEM use
`limix-publish jwks`, or build the public JWK yourself.

## an oct key is a shared secret and cannot go in a key set: use an asymmetric key

An `oct` JWK would let any reader forge a token. Publish an `EC`, `OKP` or `RSA`
public key.

## a key set needs at least one key

`jwksOf([])`: list the key or keys readers should trust.

## duplicate kid "<kid>"

Two entries of `jwksOf` share a `kid`. Give each key its own.

## the key set holds private material (kid "<kid>"): build it with jwksOf, which keeps the public part only

`jwksEndpoint` was given a set with a private member (`d`, `p`, `q`, ...) or an
`oct` key. Build the set with `jwksOf`; if a private key was ever served,
rotate it.

## the key set holds no key

`jwksEndpoint` was given `{ keys: [] }`. Build the set with `jwksOf`.

## `maxAge` must be a non-negative integer (seconds)

`jwksEndpoint(jwks, { maxAge })` takes whole seconds.

## `token` must be a non-empty string or a function returning one

`rulesEndpoint({ token })` takes the signed token or a function that returns
it, not the rules, and not an empty string (sign first).

## Invalid rules in the rules to sign: <n> issue(s)

The rules a reader would refuse. Each line names the path and the problem; the
message is the core's `RulesError`. A rule that names a condition outside
`conditions` is listed too: register the name, or add it to `conditions`.

## the endpoint answers 503

The `token` function threw or returned an empty string. The message is kept
out of the response; look in your logs where the function reads the token.
The reader keeps serving its last good copy.

## the endpoint answers 401

`authorize` returned false: the request lacked what you check, usually the
reader's `authToken` as `Authorization: Bearer`.

## the endpoint answers 500

`authorize` threw. The message is never sent; catch it in your function and
return false or true.

## <command> takes ... / missing --<flag> / unknown command "<name>"

A wrong command line: usage is printed on stderr and the exit code is 2. Run
`limix-publish <command> --help`.

## --expires "<text>" is not a duration: use seconds or 30m, 12h, 7d

`--expires` takes whole seconds or a number with `s`, `m`, `h` or `d`.

## --ver "<text>" must be a positive integer

Give `--ver 12`, not `--ver 0` or `--ver 1.5`.

## --key "<text>" must be <pem file>:<kid>

`limix-publish jwks --key policy.pub.pem:2026-11`: the file, a colon and the
`kid`. A path with a colon is fine: the last colon splits.

## could not read the key as a PEM: <reason>

The file is not a PEM key. `sign` needs a PKCS#8 private key
(`-----BEGIN PRIVATE KEY-----`), `jwks` an SPKI public or PKCS#8 private one.
An `-----BEGIN EC PRIVATE KEY-----` file converts with
`openssl pkcs8 -topk8 -nocrypt -in old.pem -out policy.key.pem`.

## could not import the PKCS#8 key as <alg>: <reason>

`--alg` (or the `alg` given to `importSigningKey`) names an algorithm the key
cannot serve, or the file is not a PKCS#8 key. Leave `--alg` out to infer it
from an EC P-256, Ed25519 or RSA-PSS key.

## an RSA key fits both RS256 and PS256: pass --alg RS256 or --alg PS256

A plain RSA key (`rsaEncryption`) can sign either way, so the command will not
guess. `sign` and `jwks` exit 2 until you name one, and the reader must accept
that `alg` (it accepts both).

## an EC key on <curve> cannot sign rules: only P-256 (ES256)

The EC key is on another curve (P-384, P-521, secp256k1). Generate a P-256 key
or use Ed25519.

## a <type> key cannot sign rules: use EC P-256, Ed25519 or RSA

The PEM holds a key of a kind that fits none of the four algorithms (DSA, X25519,
DH). Generate an EC P-256, Ed25519 or RSA key.

## alg "<alg>" is not allowed: use RS256, PS256, ES256, EdDSA

The short form of the first entry above, from `--alg` on the command line.

## the PEM is a PKCS#1 or SEC1 key (BEGIN RSA/EC PRIVATE KEY): convert it with `openssl pkcs8 -topk8 -nocrypt -in key.pem -out key.p8.pem`

The key file begins `-----BEGIN RSA PRIVATE KEY-----` or
`-----BEGIN EC PRIVATE KEY-----`. Convert it as the message says and sign with
the new file (`-----BEGIN PRIVATE KEY-----`).

## the key set holds a key that cannot verify (kid "<kid>"): its key_ops lack "verify"; build the set with jwksOf

`jwksEndpoint` was given a JWK whose `key_ops` does not list `verify`, which
readers' libraries would refuse. `jwksOf` drops `key_ops` and the other members
that are not public; build the set with it.

## the key set is malformed: <reason>

`check` (or `verifyRules`, code `SIGNATURE`) was given a file that is JSON but
not a key set: it must be `{ "keys": [ ... ] }`. Serve and pass what `jwksOf`
produced.

## <file> is not JSON: <reason>

The file given to `--jwks` is not JSON. Pass the output of `limix-publish jwks`
(or `JSON.stringify(await jwksOf(...))`), not a PEM.

## ENOENT: no such file or directory, open '<file>' (and EISDIR, EACCES)

A file the command reads or writes is missing, a directory, or not permitted.
The message is the system's, on one line, and the exit code is 1. Check the
path of the rules, the key, the token, `--jwks` and `--out`.

## EXPIRED: the token expired at <time>

`check` found a valid token past its `exp`. Re-sign it. A reader still serves
it until `exp + maxStaleMs`, then fails closed.

## SIGNATURE / CLAIMS / RULES_REFUSED: <message>

`check` printed a reader's refusal (a rule naming a condition needs the same
`--conditions` as `sign`): the key set does not hold the key that
signed (`SIGNATURE`), `--aud`, `--iss` or a claim differs (`CLAIMS`), or the
rules name a condition missing from `--conditions` (`RULES_REFUSED`). The exit
code is 1.
