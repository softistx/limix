# @softistx/limix

A policy engine for REST and GraphQL: rules that decide whether a caller may
reach a route or a field, written in YAML or JSON or through a typed builder,
with relations checked through a port and coverage over your operations.

> **Nothing published yet.** This package is a skeleton: it exports one
> constant, the version of the rules format. See the [roadmap](docs/roadmap.md).

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
| `.` | The package entry: `LIMIX_FORMAT_VERSION` |
| `./package.json` | The package manifest |

```ts
import { LIMIX_FORMAT_VERSION } from '@softistx/limix'

console.log(LIMIX_FORMAT_VERSION) // 1
```

## Documentation

See [docs/](docs/README.md): the [roadmap](docs/roadmap.md) and
[troubleshooting](docs/troubleshooting.md).
