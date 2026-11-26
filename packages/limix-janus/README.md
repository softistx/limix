# @softistx/limix-janus

The relations adapter of [`@softistx/limix`](https://github.com/softistx/limix/blob/develop/packages/limix/README.md): answers a
rule's relation checks ("may this user edit this document?") through janus
permissions (`can`).

> **Nothing published yet.** See the [roadmap](docs/roadmap.md).

## Install

Not on npm yet. Once published:

```sh
bun add @softistx/limix-janus @softistx/limix @softistx/janus
```

`@softistx/limix`, `@softistx/janus` and `typescript` (6 or 7) are required
peers. `@softistx/janus` must be 0.84.0 or later and below 1.0.0, and
`@softistx/limix` the caret range of the version this release was built
against (the repository's `workspace:^` becomes `^<version>` when the package
is packed). Your tsconfig resolves as a bundler does
(`"moduleResolution": "bundler"`, which Bun and every bundler use): the
declarations import without extensions, so `nodenext` is not supported.

## Usage

| Export | What it is |
| --- | --- |
| `janusRelations({ access, subjectOf?, ctxOf? })` | A `RelationChecker` over `access.can`: one `can(subject, relation, { type, id })` per query, answers in order |
| `checkRulesAgainstModel(policy, model)` | Lists every relation term of a compiled policy whose `type` or `relation` the janus model does not declare; empty means consistent |
| types `JanusRelationsOptions`, `CheckIssue`, `ModelLike` | The shapes the functions take and return |
| `@softistx/limix-janus/package.json` | The package manifest |

Wire it into `evaluateRest` (copy-paste, with a janus model and the in-memory
store):

```ts
import {
  createMemoryRelations,
  defineModel,
  permissions,
} from '@softistx/janus/permissions'
import { compilePolicy, definePolicy, evaluateRest } from '@softistx/limix'
import { checkRulesAgainstModel, janusRelations } from '@softistx/limix-janus'

const model = defineModel({
  subjects: ['user'],
  types: {
    document: {
      related: { viewers: ['user'], editors: ['user'] },
      permits: { view: ['viewers', 'edit'], edit: ['editors'] },
    },
  },
})
const access = permissions({ model, store: createMemoryRelations() })
await access.grant({ type: 'document', id: 'd1' }, 'editors', { type: 'user', id: 'ada' })

const policy = compilePolicy(definePolicy({
  limix: 1,
  global: { unmatched: 'deny' },
  rest: {
    '/documents/:id': {
      GET: { relations: [{ require: [[{ relation: 'view', type: 'document' }]] }] },
    },
  },
}))

// At startup: a typo in the rules fails here, not as a janus error per request.
const issues = checkRulesAgainstModel(policy, model)
if (issues.length) throw new Error(issues.map((i) => `${i.path}: ${i.message}`).join('\n'))

const decision = await evaluateRest(policy, {
  method: 'GET',
  path: '/documents/d1',
  claims: { authenticated: true, subject: { type: 'user', id: 'ada' } },
  relations: janusRelations({ access }),
})
// { allow: true }
```

`subjectOf` maps `claims.subject` to the janus subject when your claims name
users differently; `ctxOf` supplies the `ctx` janus requires when a permission
reaches a `when`. The [janus guide](docs/janus.md) covers both, errors and
the limits.

## Documentation

See [docs/](docs/README.md): the janus guide, troubleshooting and the roadmap.
