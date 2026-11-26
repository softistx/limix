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
| `@softistx/limix-graxia` | Rules on GraphQL fields, the link to `@needs`, the operations coverage reads. |
| `@softistx/limix-alxia` | alxia's HTTP routes, tenant and refusals; reuses `limix-graxia` for GraphQL. |
| `@softistx/limix-publish` | The emitter: signs a rules file as a JWS and serves the JWKS (API and CLI). |

## Decisions (owner, 2026-11-26)

- The rules format starts from `@softistx/security` 5 and may break it where
  that simplifies, with a migration guide and no compatibility aliases.
- No Ory or Keto adapter: relations go through the port, janus first.
- Pilot: clavix-api, whose roadmap waits on remote rules.
- Later, not in 1.0: `restricted`, the gateway trust proof, how limix and
  `@softistx/alxia-access` fit together, moving core's `shared-hono` and
  `shared-graphql` off `@softistx/security`, and a type-safe rules editor built
  on `@softistx/material`.
- The repository is public; versions stay 0.x until the pilot runs on them.

## Layout

A library monorepo (the `lay-out-a-library-monorepo` skill of the `package`
plugin). The shared root files (`bunfig.toml`, `.gitignore`, `LICENSE`,
`tsconfig*.json`, `scripts/tsconfig.json`, `build.ts`) are copied from
softistx/janus, the nearest `@softistx` library monorepo; a difference is a
drift to fix there first.

Carried from janus, adapted to limix: `.github/actions/setup`, the `ci.yml`,
`release.yml` and `publish.yml` workflows, and the scripts they call
(`scripts/publish*.ts`, `scripts/verify-artifacts.ts` with `scripts/artifacts/`,
`affected.ts`, `check-changesets.ts`, `close-released-issues*.ts`), each with
its spec. Every package is `"private": true` for now: nothing publishes until a
commit of its own removes it.

Declared divergences from janus:

- No database services in `ci.yml` and the setup action (PostgreSQL, MongoDB,
  Redis cache and build steps, `.github/actions/postgres`), and `affected.ts`
  no longer reports `redis` or `postgres`: limix has no database.
- No plugin machinery (`plugins/`, `plugin-index.ts`, `plugin-manifests.spec.ts`):
  limix is not a plugin marketplace.
- No `check:type-counts` step: no package holds `@ts-expect-error` fixtures yet.
- No peer-floor tooling (`run-on-peer-floor`, `run-in-floor-project`,
  `newest-peers`, `test-retry`) and no `nightly.yml`: the floor matrices exist
  for packages with many peers and drivers.
- No `nxgt-versions.yml` or `check-nxgt-versions.ts`: limix depends on no
  `@nxgt` package.
- `biome.json` turns off `useLiteralKeys` only, which the scripts need under
  `noPropertyAccessFromIndexSignature`; janus's naming-convention rule is its
  own.
- No `typecheck:tsc` script: limix typechecks with `bun check` alone.
- `.changeset/first-package-skeleton.md` is an empty changeset: `changeset:private`
  refuses one naming a private package, and `changeset:status` wants one.


Imports carry no extension; consumers resolve as a bundler does
(`"moduleResolution": "bundler"`).
