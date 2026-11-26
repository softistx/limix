# @softistx/limix

A policy engine for REST and GraphQL: rules that decide whether a caller may
reach a route or a field, written in YAML or JSON or through a typed builder,
with relations checked through a port and coverage over your operations.

> **Nothing published yet.** The rules format (parse, load, build, compile) and
> evaluation (REST, GraphQL fields, relations, explain) are in. See the [roadmap](docs/roadmap.md).

## Install

Not on npm yet. Once published:

```sh
bun add @softistx/limix
```

`typescript` (6 or 7) is a required peer. Your tsconfig resolves as a bundler
does (`"moduleResolution": "bundler"`, which Bun and every bundler use): the
declarations import without extensions, so `nodenext` is not supported.

## Usage

| Export | What it is |
| --- | --- |
| `parseRules(input, source?)` | Validates a value (an object, or a YAML or JSON text you parsed), returns `Rules` |
| `loadRules(path)` | Reads a `.yaml`, `.yml` or `.json` file, then `parseRules` |
| `definePolicy(rules)` | Writes the document in code; a typo fails to compile |
| `compilePolicy(rules, { conditions })` | Precompiles the route and field tables into a `CompiledPolicy` |
| `evaluateRest(policy, input)` | Decides a REST request (`method`, `route` or `path`, `claims`, `request`, `relations`): `{ allow: true }` or `{ allow: false, refusal }` |
| `evaluateField(policy, input)` | The same for one GraphQL field (`type`, `field`, `claims`, `args`, `source`) |
| `explain(policy, input)` | The same evaluation, with every step, for a simulator |
| `staticSource(policy)`, `mutableSource(initial?)`, `isPolicySource` | Where an evaluator gets its policy; an empty source refuses with `limix.errors.unavailable` |
| `LimixRefusal`, `isLimixRefusal` | The neutral refusal `{ code, status, params }` and its guard |
| `RulesError` | Thrown for invalid rules; `error.issues` lists every issue |
| `LIMIX_FORMAT_VERSION` | The format version, `1` |
| `DEFAULT_FROM`, `DEFAULT_ON_DENY` | What a relation term reads when it names no `from` (`param.id` on REST, `args.id` on GraphQL) and how a rung answers when it names no `onDeny` (`NOT_FOUND`) |
| types `Claims`, `Decision`, `RelationChecker`, `RelationQuery`, `PolicySource`, `Explanation`, `Step`, `RestInput`, `FieldInput`, `Rules`, `RulesIssue`, `CompileOptions`, `Condition`, `ConditionContext`, `CompiledPolicy`, `CompiledRestRoute`, `CompiledGraphqlEntry` | The shapes the functions take and return |
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
  const policy = compilePolicy(rules, {
    conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
  })
} catch (error) {
  if (error instanceof RulesError) {
    for (const { path, message } of error.issues) console.error(`${path}: ${message}`)
  }
  throw error
}
```

To read the rules from a file, `loadRules` takes a path; `parseRules` takes a
value, an object or the result of parsing YAML or JSON yourself, and an
optional source name for the error message:

```ts
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
import { loadRules, parseRules } from '@softistx/limix'

const fromFile = await loadRules('rules.yaml')
const fromText = parseRules(parse(await readFile('rules.yaml', 'utf8')), 'rules.yaml')
```

`LIMIX_FORMAT_VERSION` is `1`, the value of the `limix` key. The JSON schema is
also importable, for tools that validate or generate from it:

```ts
import schema from '@softistx/limix/rules.schema.json' with { type: 'json' }
```

The format is described in [docs/rules.md](docs/rules.md).

## Evaluating

Hand the compiled policy, the caller's claims and the request to an evaluator.
It answers with a decision and never throws for a refusal; a refusal is a
neutral `{ code, status, params }`, with no HTTP framework in it:

```ts
import { evaluateRest, type RelationChecker } from '@softistx/limix'

const relations: RelationChecker = {
  check: async (queries) => queries.map(() => true), // your backend
}

const decision = await evaluateRest(policy, {
  method: 'PUT',
  route: '/documents/:id',
  claims: { authenticated: true, subject: { type: 'user', id: 'u1' }, roles: ['editor'] },
  request: { params: { id: '42' } },
  relations,
})

if (!decision.allow) console.log(decision.refusal.status, decision.refusal.code)
```

The ladder is 401, then 403 (`roles`, `permissions`, `when`), then each
relation rung's own answer (404 by default); the `RelationChecker` is called
once per rung with every query of that rung. A GraphQL field goes through
`evaluateField(policy, { type, field, claims, args, relations })`, and
`explain` takes the same input and returns the `steps` it went through. See
[evaluation](docs/evaluation.md) and [relations](docs/relations.md).

## Documentation

See [docs/](docs/README.md): the [rules format](docs/rules.md),
[evaluation](docs/evaluation.md), [relations](docs/relations.md), the
[roadmap](docs/roadmap.md) and [troubleshooting](docs/troubleshooting.md).
