# @softistx/limix

A policy engine for REST and GraphQL: rules that decide whether a caller may
reach a route or a field, written in YAML or JSON or through a typed builder,
with relations checked through a port and coverage over your operations.

> **Nothing published yet.** The rules format (parse, load, build, compile) is
> in; evaluation is not. See the [roadmap](docs/roadmap.md).

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
| `.` | `parseRules`, `loadRules`, `definePolicy`, `compilePolicy`, `LIMIX_FORMAT_VERSION`, types `Rules`, `CompiledPolicy`, `Condition`, `RulesError` |
| `./rules.schema.json` | The JSON schema of a rules document, for editor completion |
| `./package.json` | The package manifest |

Write rules in YAML:

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

or in code, where a typo fails to compile:

```ts
import { compilePolicy, definePolicy, loadRules } from '@softistx/limix'

const typed = definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: { '/documents/:id': { PUT: { permissions: [['documents:write']], when: ['workingHours'] } } },
})

const rules = await loadRules('rules.yaml') // the same structure
const policy = compilePolicy(rules, {
  conditions: { workingHours: ({ claims }) => claims['shift'] === 'day' },
})
```

Invalid rules throw a `RulesError` listing every issue with its path. The
format is described in [docs/rules.md](docs/rules.md).

## Documentation

See [docs/](docs/README.md): the [rules format](docs/rules.md), the
[roadmap](docs/roadmap.md) and [troubleshooting](docs/troubleshooting.md).
