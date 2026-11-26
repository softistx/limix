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
drift to fix there first. Not yet carried over: CI, release and publish
scripts, `verify:artifacts`. They come with the first package.

Imports carry no extension; consumers resolve as a bundler does
(`"moduleResolution": "bundler"`).
