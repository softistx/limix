# AGENTS.md

## What this repository is

limix is a policy engine: rules that decide whether a caller may reach a REST
route or a GraphQL field. It succeeds the `policy` part of
`@softistx/security` (softistx/core), which is in minimal maintenance (security
fixes only on 5.x) until nothing imports it, then `npm deprecate`d.

## Packages (planned for 1.0)

| Package | What it holds |
| --- | --- |
| `@softistx/limix` | The core, framework-agnostic: rules in YAML/JSON (JSON schema) or through a typed `definePolicy` builder producing the same structure; REST and GraphQL evaluation; the `RelationChecker` port; coverage over a neutral list of operations; the remote client (signed JWS, JWKS, hot swap, last good copy kept through an outage). |
| `@softistx/limix-janus` | The `RelationChecker` adapter over janus `can`. |
| `@softistx/limix-graxia` | The graxia and graphql-js integration: a field guard (`guardSchema`) and graxia plugin (`limixGraxia`), `checkNeeds` and `canOf` for `@needs`, `graphqlOperations` for coverage. |
| `@softistx/limix-alxia` | The alxia integration: `limixGuard` (a middleware judging every request that reaches a route, refusals in the app's error format), `alxiaOperations` for coverage, `checkRoutes`, and `limixGraphql` (`./graphql`, the endpoint behind `limix-graxia`). |
| `@softistx/limix-codegen` | Build-time types for the rules: a CLI and a graphql-codegen plugin that register the API's operations (GraphQL SDL through `limix-graxia/operations`, OpenAPI) and the rules file's permission, role and condition names in core's `Register`, `--check` for CI, and `init` for a starter rules file. |
| `@softistx/limix-publish` | The emitter: signs a rules file as a JWS and serves the JWKS (API and CLI). |

## Decisions (owner, 2026-11-26)

- The rules format starts from `@softistx/security` 5 and may break it where
  that simplifies, with a migration guide and no compatibility aliases.
- No Ory or Keto adapter: relations go through the port, janus first.
- Pilot: clavix-api protects its own GraphQL API with a local rules file through
  limix-graxia and limix-alxia (Clavix serves no signed rules, owner 2026-11-27).
  Remote rules stay, proved by the limix-publish round-trip specs.
- Later, not in 1.0: `restricted`, the gateway trust proof, how limix and
  `@softistx/alxia-access` fit together, moving core's `shared-hono` and
  `shared-graphql` off `@softistx/security`, and a type-safe rules editor built
  on `@softistx/material`.
- The repository is public, the npm packages are published with
  `access: "restricted"` (owner, 2026-11-26); versions stay 0.x until the pilot runs on
  them.
- `path-to-regexp` stays a root devDependency, declared: a dev-only reference
  for the port (`matcher.differential.spec.ts` compares the in-house matcher
  with it, and `bench/routes.bench.ts` uses it as the baseline). It is never a
  dependency of a package.
- `yaml` stays a root devDependency, declared: a dev-only reference
  (`duplicate-keys.differential.spec.ts` checks that the duplicate-key scanner
  of `./bun` reports a duplicate exactly when `yaml` refuses the key). It is
  never imported by `src` nor a dependency of a package.
- `hono` stays a root devDependency, declared: the Hono recipe of the migration
  guide (`packages/limix-alxia/examples/migrating-from-security/hono.ts`)
  compiles against it and `migration-guide.spec.ts` runs it. It is never imported
  by `src` nor a dependency of a package.

## Layout

A library monorepo (the `lay-out-a-library-monorepo` skill of the `package`
plugin). The shared root files (`bunfig.toml`, `.gitignore`, `LICENSE`,
`tsconfig*.json`, `scripts/tsconfig.json`, `build.ts`) are copied from
softistx/janus, the nearest `@softistx` library monorepo; a difference is a
drift to fix there first.

Carried from janus: `.github/actions/setup`, the `ci.yml`,
`release.yml` and `publish.yml` workflows, and the scripts they call
(`scripts/publish*.ts`, `scripts/verify-artifacts.ts` with `scripts/artifacts/`,
`affected.ts`, `check-changesets.ts`, `close-released-issues*.ts`), each with
its spec. Every file but the byte copies of `close-released-issues*.ts` is adapted
to limix (see the divergences below). Every package
publishes, from 0.1 on, through the Version PR and a tag; a new package starts
`"private": true` and publishes from a commit of its own that removes it, with
its changeset.

The migration guide's TypeScript fences are byte copies of
`packages/limix-alxia/examples/migrating-from-security/*.ts`, which
`migration-guide.spec.ts` holds: edit the file, then paste it.

Declared divergences from janus:

- No database services in `ci.yml` and the setup action (PostgreSQL, MongoDB,
  Redis cache and build steps, `.github/actions/postgres`), and `affected.ts`
  no longer reports `redis` or `postgres`: limix has no database.
- No plugin machinery (`plugins/`, `plugin-index.ts`, `plugin-manifests.spec.ts`):
  limix is not a plugin marketplace.
- No `check:type-counts` step: the type tests (`@ts-expect-error` cases in
  `define.spec.ts`) are few enough to read; the count tooling comes back if they
  grow.
- No peer-floor tooling (`run-on-peer-floor`, `run-in-floor-project`,
  `newest-peers`, `test-retry`) and no `nightly.yml`: the floor matrices exist
  for packages with many peers and drivers.
- `@softistx/limix-janus` accepts any `@softistx/janus` `>=0.84.0 <1.0.0`
  (declared: the adapter reads only `can` and `model.definition.types[*].related|permits`,
  so any 0.x minor from 0.84 is accepted). With no peer-floor tooling, a new
  janus minor is untested until a limix-janus release.
- `@softistx/limix-graxia` accepts any `@softistx/graxia` `>=0.18.0 <1.0.0`
  (declared: it reads `definePlugin` and, through `./agent`, `needsOf`, so any
  0.x minor from 0.18 is accepted). With no peer-floor tooling, a new graxia
  minor is untested until a limix-graxia release. It also has a `./operations`
  subpath (`graphqlOperations` alone, importing only `graphql`, never graxia) for
  build-time tools such as `@softistx/limix-codegen`.
- `@softistx/limix-alxia` accepts any `@softistx/alxia` `>=0.28.0 <1.0.0` and
  `@softistx/alxia-graphql` `>=0.20.2 <1.0.0` (declared: it reads `ctx.route`,
  `app.routes` and `app.sockets`, `ctx.pathParams`, `RouteDefinition.handler`
  and `SocketDefinition.handlers` by identity (a group, plugin or mount copy
  keeps the handler, which is how `limixGraphql`'s endpoint is told apart),
  `derive` (the guard's own middleware is looked for in a definition's chain),
  `defineMiddleware`, `markFactory`,
  `errorFormat`, `problemOf` and `problem`, and `graphql()` with its `schema` and
  `plugins` options, so any 0.x minor from those is accepted). With no
  peer-floor tooling, a new alxia minor is untested until a limix-alxia release.
  It takes no `@softistx/alxia-access` or `@softistx/alxia-tenancy` dependency:
  it reads the shape of their refusals (a string `code` under `auth.errors.` or
  `tenancy.errors.` and a numeric `status`) and gets the tenant through the
  host's `claims(ctx)`.
- No `nxgt-versions.yml` or `check-nxgt-versions.ts`: limix depends on no
  `@nxgt` package.
- `biome.json` turns off `useLiteralKeys` only, which the scripts need under
  `noPropertyAccessFromIndexSignature`; janus's naming-convention rule is its
  own.
- No `typecheck:tsc` script: limix typechecks with `bun check` alone.
- No "generated code is committed" CI step: no package commits generated code of its own (limix-codegen's golden `generated.fixtures.ts` is held by its spec).
- No `format` or `lint` root scripts: `fix` covers both.
- `.gitignore` re-includes `packages/*/src/coverage/` (the `./coverage` subpath's
  source), which janus's `coverage` line, a test-report folder, would ignore, until
  softistx/janus anchors its `coverage` pattern (softistx/janus#1081).
- A change to a private package needs no changeset (changesets ignores private
  packages, and `check-changesets` refuses one naming it).

## Release and CI

- **Runner**: every job runs on
  `${{ fromJSON(vars.CI_RUNNER_LIBS || '"ubuntu-latest"') }}`. The value is JSON
  (quotes required). limix sets `CI_RUNNER_LIBS` at repository level to
  `"ubuntu-latest"`: a public repository never runs on the owner's self-hosted
  runner, since a fork's pull request would run code on that machine.
- **Publishing** goes to registry.npmjs.org only, in CI only (`publish.yml`),
  with the secret `NPM_TOKEN` (no `environment:`). It starts on a tag `v*` or
  `<pkg>@<x.y.z>`, a release or a manual dispatch, and the commit must be an
  ancestor of `develop` (the develop-ancestor check). `release.yml` only opens
  the Version PR. Recipe: merge it, then from an up-to-date `develop` run
  `bun --bun x changeset tag && git push --follow-tags` (`--bun`: the
  Changesets CLI needs a newer Node than the machine's). The tag push starts
  `publish.yml`; run `gh workflow run publish.yml --ref develop` only when more
  than three tags went at once (GitHub then fires no push event).
  `scripts/publish.ts` skips versions npmjs already holds (also on a 403
  "cannot publish over" while npmjs still answers 404 for a new package), so a
  re-run resumes, and never builds: run `bun run build` first. A package marked
  `"private": true` never publishes.
- **`verify:artifacts`** packs each package and loads the tarball. It refuses a
  package whose `publishConfig` is not `{ registry: npmjs, access: "restricted" }`, a build exiting 0 whose artifact does
  not load, declarations that no longer compile, an import not declared as a
  dependency or peer, a runtime dependency that only types need, and duplicate
  classes (the highest packaging risk: two copies of a class break `instanceof`).
- **Released issues**: the `close-issues` job of `publish.yml` closes the issues
  a published version fixes.

Deliberate duplication:

| What | Where | Why |
| --- | --- | --- |
| `held.ts` and `options.ts` checks of `limix-alxia` | `packages/limix-alxia/src/` and `packages/limix-graxia/src/{wrap,options}.ts` | The same shape (a policy held once per source, a fit check cached per policy, an outage reporter, the options checks), but the fit checks differ: graxia judges a policy against a schema, alxia against the routes. graxia checks a static policy at setup; alxia checks its routes on the first request, because routes are declared after the guard, and that difference stays. Extract a shared snapshot helper into `@softistx/limix` when a third integration needs it. |
| `cli/run.ts`, `cli/io.ts` of `limix-codegen` | `packages/limix-publish/src/cli/{run,io}.ts` | The same shape (`run(argv, io)` returning an exit code, a fake-able `Io`, `UsageError`), but each package owns its commands and its error classes. Extract a shared CLI helper into `@softistx/limix` when a third CLI needs it. |
| The identifier regexes (`IDENTIFIER`, `ID_CONTINUE`) of `limix-codegen/src/openapi.ts` | `packages/limix/src/rules/compile/pattern.ts` | `openapiPath` must quote a name exactly when the pattern parser would not read it bare; core exports no such predicate. Export one from core when the pattern grammar changes next (a drift fails `openapi.spec.ts`, which compiles every converted path). |
| `METHODS` of `limix-codegen/src/order.ts` | `zMethods` in `packages/limix/src/rules/rest.ts` | The order a generated union and a starter file list methods in; core exports no list of its own. Export it from core when a second package needs it. |
| `close-released-issues.ts`, `-lib.ts`, `-git.ts` and their spec | `scripts/close-released-issues*.ts` | Byte copies of softistx/plugins `plugins/nxgt-base/scripts/issues/release/`: re-copy, never edit. The 1,165-line spec is not split for that reason. |

Imports carry no extension; consumers resolve as a bundler does
(`"moduleResolution": "bundler"`).
