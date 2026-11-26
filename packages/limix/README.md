# @softistx/limix

A policy engine for REST and GraphQL: rules that decide whether a caller may
reach a route or a field, written in YAML or JSON or through a typed builder,
with relations checked through a port, coverage over your operations and signed
rules pulled from a policy server.

> **Nothing published yet.** The rules format (parse, load, build, compile),
> evaluation (REST, GraphQL fields, relations, explain), coverage and the remote
> client are in. See the [roadmap](docs/roadmap.md).

## Install

Not on npm yet. Once published:

```sh
bun add @softistx/limix
```

The package has two runtime dependencies, `zod` (the rules schema and its JSON
schema) and `jose` (signed remote rules). Route patterns are compiled by limix
itself, and `loadRules` uses Bun's own file and YAML APIs.

`typescript` (6 or 7) is a required peer. Your tsconfig resolves as a bundler
does (`"moduleResolution": "bundler"`, which Bun and every bundler use): the
declarations import without extensions, so `nodenext` is not supported.

## Subpaths

| Import | What it holds | Runs in a browser |
| --- | --- | --- |
| `@softistx/limix` | Rules, evaluation, sources, relations | yes (imports no `node:` module) |
| `@softistx/limix/coverage` | `coverage`, `rulesPathOf` and the operation types | yes |
| `@softistx/limix/remote` | `remotePolicy`, the signed-rules client, and `RemotePolicyError` | yes (global `fetch` and `jose` only) |
| `@softistx/limix/bun` | `loadRules`, which reads a rules file from disk, and `filePolicyStore`, which keeps the last good remote copy | no (Bun only: `Bun.file`, `Bun.YAML`) |
| `@softistx/limix/rules.schema.json` | The JSON schema of a rules document | n/a |

## Usage

| Export | What it is |
| --- | --- |
| `parseRules(input, source?)` | Validates a value (an object, or a YAML or JSON text you parsed), returns `Rules` |
| `loadRules(path)` from `@softistx/limix/bun` | Reads a `.yaml`, `.yml` or `.json` file, then `parseRules` |
| `definePolicy(rules)` | Writes the document in code; a typo fails to compile |
| `compilePolicy(rules, { conditions })` | Precompiles the route and field tables into a `CompiledPolicy` |
| `evaluateRest(policy, input)` | Decides a REST request (`method`, `route` or `path`, `claims`, `request`, `relations`, `info`): `{ allow: true }` or `{ allow: false, refusal }` |
| `evaluateField(policy, input)` | The same for one GraphQL field (`type`, `field`, `claims`, `args`, `source`, `relations`, `info`, `root`) |
| `explain(policy, input)` | The same evaluation, with every step, for a simulator |
| `staticSource(policy)`, `mutableSource(initial?)`, `policySource(impl)`, `isPolicySource`, `POLICY_SOURCE` | Where an evaluator gets its policy; an empty source refuses with `limix.errors.unavailable`. `mutableSource` adds `swap(policy \| null)`; `policySource` brands your own `{ current, subscribe }` |
| `outageReporter(report)`, `OUTAGE_MESSAGE` | Logs "the source holds no policy" once per withdrawal, not once per request |
| `LimixRefusal`, `isLimixRefusal`, `LIMIX_REFUSAL` | The neutral refusal `{ code, status, params }`, its guard and the symbol it carries |
| `CODE_UNAUTHENTICATED`, `CODE_FORBIDDEN`, `CODE_NOT_FOUND`, `CODE_UNAVAILABLE` | The refusal codes: `auth.errors.unauthenticated`, `auth.errors.forbidden`, `auth.errors.not-found`, `limix.errors.unavailable` |
| `RulesError` | Thrown for invalid rules; `error.issues` lists every issue |
| `LIMIX_FORMAT_VERSION` | The format version, `1` |
| `DEFAULT_FROM`, `DEFAULT_ON_DENY` | What a relation term reads when it names no `from` (`param.id` on REST, `args.id` on GraphQL) and how a rung answers when it names no `onDeny` (`NOT_FOUND`) |
| types `Claims`, `Subject`, `Decision`, `RelationChecker`, `RelationQuery`, `PolicyInput`, `PolicySource`, `MutableSource`, `Explanation`, `Step`, `StepKind`, `TermStep`, `RestInput`, `RestRequest`, `FieldInput`, `Rules`, `RulesIssue`, `CompileOptions`, `Condition`, `ConditionContext`, `CompiledPolicy`, `CompiledRestRoute`, `CompiledGraphqlEntry` | The shapes the functions take and return |
| `remotePolicy(options)` from `@softistx/limix/remote` | A `PolicySource` that pulls rules signed as a JWS, verifies them against the publisher's JWKS (`jwksUri`, or the issuer's discovery), hot-swaps them and keeps the last good copy through an outage (`ready`, `refresh()`, `stop()`, `age()`, `version()`) |
| `RemotePolicyError`, `RemotePolicyConfigError`, `DEFAULT_TYP` from `@softistx/limix/remote` | The failure of a pull (`code`: `FETCH_FAILED`, `HTTP_STATUS`, `SIGNATURE`, `CLAIMS`, `STALE_VERSION`, `RULES_REFUSED`, `STORE`, `EXPIRED`, `TOO_LARGE`), a refused option, and the default `typ` `limix-rules+jwt` |
| `filePolicyStore(path)` from `@softistx/limix/bun` | A `PolicyStore` over one JSON file, so a restart serves the last good copy before the first pull |
| types `RemotePolicy`, `RemotePolicyOptions`, `RemotePolicyLogger`, `PolicyStore`, `StoredPolicy`, `RemotePolicyErrorCode` from `@softistx/limix/remote` | The shapes the remote client takes and returns |
| `rulesPathOf(openApiPath)` from `@softistx/limix/coverage` | `/things/{id}` to `/things/:id`, to build an operation list |
| `coverage(policy, operations)` from `@softistx/limix/coverage` | Which operations the rules cover, leave public or leave to `global.unmatched`, and which rules are stale; runs in a browser or an edge runtime |
| types `Operation`, `RestOperation`, `GraphqlOperation`, `CoverageReport`, `OperationCoverage`, `CoverageStatus`, `CoverageSummary`, `StaleRule` from `@softistx/limix/coverage` | The shapes coverage takes and returns |
| `@softistx/limix/rules.schema.json` | The JSON schema of a rules document, for editor completion |
| `@softistx/limix/package.json` | The package manifest |

Write rules in YAML. The first line gives your editor completion and flags a
typo as you write it:

```yaml
# yaml-language-server: $schema=node_modules/@softistx/limix/schema/rules.schema.json
limix: 1
global:
  unmatched: deny
rest:
  /documents/:id:
    PUT:
      permissions: [[documents:write]]
      when: [workingHours]
```

or in code, where a typo, even beside a valid key, fails to compile. Both give
the same `Rules`, which `compilePolicy` turns into the tables a request is
checked against. Invalid rules throw a `RulesError` that lists every issue:

```ts
import {
  compilePolicy,
  definePolicy,
  RulesError,
} from '@softistx/limix'

const rules = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    '/documents/:id': {
      PUT: { permissions: [['documents:write']], when: ['workingHours'] },
    },
  },
})

try {
  compilePolicy(rules, {
    conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
  })
} catch (error) {
  if (error instanceof RulesError) {
    for (const { path, message } of error.issues) console.error(`${path}: ${message}`)
  }
  throw error
}
```

To read the rules from a file, `loadRules` (from `@softistx/limix/bun`, Bun only, the only part that reads the disk) takes a path; `parseRules` takes a
value, an object or the result of parsing YAML or JSON yourself, and an
optional source name for the error message:

```ts
import { parseRules } from '@softistx/limix'
import { loadRules } from '@softistx/limix/bun'

const fromFile = await loadRules('rules.yaml')
// Anywhere but Bun: read the file and parse it with your runtime's YAML (or JSON) parser.
const fromText = parseRules(Bun.YAML.parse(await Bun.file('rules.yaml').text()), 'rules.yaml')
```

`LIMIX_FORMAT_VERSION` is `1`, the value of the `limix` key. The JSON schema is
also importable, for tools that validate or generate from it:

```ts
import schema from '@softistx/limix/rules.schema.json' with { type: 'json' }
```

The format is described in [docs/rules.md](docs/rules.md).

## Evaluating

Load the rules, compile them once, then hand the compiled policy, the caller's
claims and the request to an evaluator. It answers with a decision and never
throws for a refusal; a refusal is a neutral `{ code, status, params }`, with
no HTTP framework in it:

```ts
import {
  compilePolicy,
  evaluateField,
  evaluateRest,
  explain,
  isLimixRefusal,
  type RelationChecker,
} from '@softistx/limix'
import { loadRules } from '@softistx/limix/bun'

const policy = compilePolicy(await loadRules('rules.yaml'), {
  conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
})

const relations: RelationChecker = {
  // your backend; for janus, `janusRelations({ access })` from
  // [`@softistx/limix-janus`](https://github.com/softistx/limix/blob/develop/packages/limix-janus/README.md)
  check: async (queries) => queries.map(() => true),
}

const claims = {
  authenticated: true,
  subject: { type: 'user', id: 'u1' },
  roles: ['editor'],
  scope: 'documents:write',
}

const decision = await evaluateRest(policy, {
  method: 'PUT',
  route: '/documents/:id',
  claims,
  request: { params: { id: '42' } },
  relations,
})

if (!decision.allow) console.log(decision.refusal.status, decision.refusal.code)
```

The ladder is 401, then 403 (`roles`, `permissions`, `when`), then each
relation rung's own answer (404 by default); the `RelationChecker` is called
once per rung with every query of that rung. A GraphQL field goes through
`evaluateField`, and `explain` takes the same input as either and returns the
`steps` it went through:

```ts
const field = await evaluateField(policy, {
  type: 'Mutation',
  field: 'updateNote',
  claims,
  args: { id: 'n1' },
  relations,
})

const { decision: again, steps } = await explain(policy, {
  method: 'PUT',
  path: '/documents/42',
  claims,
  relations,
})
```

An evaluator also takes a source, to swap the policy while the process runs.
One that holds none refuses every request with `limix.errors.unavailable`:

```ts
import { mutableSource } from '@softistx/limix'

const live = mutableSource()   // holds nothing yet: every call is refused (503)
live.swap(policy)              // hot swap; swap(null) withdraws it
const unsubscribe = live.subscribe((next) => console.log(next ? 'swapped' : 'withdrawn'))

await evaluateRest(live, { method: 'GET', path: '/health', claims })
```

A refusal is also an `Error`, so an integration can throw it and recognise it
further up, even when it comes from another copy of the package:

```ts
function onError(error: unknown) {
  if (isLimixRefusal(error)) return { status: error.status, code: error.code }
  throw error
}
```

A refusal's `code` is under `auth.errors.` (and `limix.errors.unavailable` for
a 503), the prefix `@softistx/alxia-access` reads. See
[evaluation](docs/evaluation.md) and [relations](docs/relations.md).

## Coverage

Does the rules file name every operation of your API, and nothing that no
longer exists? `coverage` takes the compiled policy and a list of operations
(an integration builds it from the schema or the routes) and reports, per
operation, `covered`, `public` or `uncovered` (with what `global.unmatched`
does to it), plus the `stale` rules. It lives on its own subpath, free of Node,
so it also runs in a browser (a spec of the repository proves, on the source,
that neither it nor the main entry imports a `node:` module; the subpath imports no package at all):

```ts
import { compilePolicy, definePolicy } from '@softistx/limix'
import { coverage } from '@softistx/limix/coverage'

const policy = compilePolicy(
  definePolicy({
    limix: 1,
    global: { unmatched: 'deny' },
    rest: { '/documents/:id': { GET: { authenticated: true } } },
  }),
)

const report = coverage(policy, [
  { kind: 'rest', method: 'GET', path: '/documents/:id' },
  { kind: 'graphql', type: 'Query', field: 'me', root: true },
])

// report.operations[0]
// { operation: { kind: 'rest', ... }, label: 'GET /documents/:id',
//   status: 'covered', match: 'exact' }
// report.summary
// { total: 2, covered: 1, public: 0, uncovered: 1, refused: 1, open: 0,
//   byPattern: 0, stale: 0 }

// The CI gate (the same as docs/coverage.md): fail on a REST operation or a
// root GraphQL field no rule names, on a stale rule, and on a rule reached only
// through its matcher. A GraphQL field that is not a root is open by design.
const uncovered = report.operations.filter(
  (entry) =>
    entry.status === 'uncovered' &&
    (entry.operation.kind === 'rest' || entry.operation.root),
)
const spelled = report.operations.filter((entry) => entry.match === 'pattern')
for (const entry of uncovered) console.error(`uncovered (${entry.unmatched}): ${entry.label}`)
for (const entry of spelled) console.error(`spelled differently from its rule: ${entry.label}`)
for (const rule of report.stale) console.error(`stale: ${rule.label}`)
if (uncovered.length + spelled.length + report.stale.length > 0) process.exit(1)
```

A REST `path` is best the pattern as the rules file spells it (`rulesPathOf`
converts an OpenAPI `{id}` path); another spelling is reached through the rule's
matcher and reported `match: 'pattern'`, which the gate fails on. An operation
holding a wildcard (`/files/*path`) or an optional group with a parameter is
never claimed by a matcher hit: it is `uncovered` unless a rule spells it
exactly. See
[coverage](docs/coverage.md).

## Remote rules

`remotePolicy` pulls the rules a policy server publishes as a signed compact
JWS (`typ` `limix-rules+jwt`), verifies them against the issuer's keys, and is a
`PolicySource`: pass it to an evaluator where you would pass a policy. A new
`ver` applies to the next request; a stale `ver` is refused; an outage keeps the
last good copy up to `maxStaleMs`, then refuses with `limix.errors.unavailable`.
It uses the global `fetch` and `jose` only, so it runs in a browser or an edge
runtime:

Give `jwksUri` or `issuer` (or both): without one, `remotePolicy` throws a
`RemotePolicyConfigError` at construction.

```ts
import { evaluateRest } from '@softistx/limix'
import { remotePolicy } from '@softistx/limix/remote'
import { filePolicyStore } from '@softistx/limix/bun'

const claims = { authenticated: true, shift: 'day' }

const policy = remotePolicy({
  rulesUrl: 'https://policy.example.com/rules',
  audience: 'billing-api',
  issuer: 'https://policy.example.com',
  conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
  onError: (error) => console.error(error.code, error.message),
  // Optional: serve the last good copy straight after a restart.
  store: filePolicyStore('./policy.json'),
})

const decision = await evaluateRest(policy, { method: 'GET', path: '/invoices', claims })
```

`trustedKeys` only pins the keys a stored copy may carry; live pulls are always
verified against the publisher's key set. Pulls refuse redirects, so the bearer
token never follows one. See [remote](docs/remote.md).

## Documentation

See [docs/](docs/README.md): the [rules format](docs/rules.md),
[evaluation](docs/evaluation.md), [relations](docs/relations.md),
[coverage](docs/coverage.md), [remote rules](docs/remote.md), the
[roadmap](docs/roadmap.md) and [troubleshooting](docs/troubleshooting.md).
