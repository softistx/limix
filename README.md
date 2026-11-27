# limix

A policy engine for REST and GraphQL: rules in YAML/JSON or a typed builder,
relations through a port (janus first), coverage, and signed remote rules.

0.x on npm (restricted access); versions stay 0.x until a pilot runs on them.

| Package | What it is |
| --- | --- |
| [`@softistx/limix-alxia`](packages/limix-alxia/README.md) | The alxia integration: route guard, refusals, coverage operations, GraphQL endpoint behind the same rules |
| [`@softistx/limix-codegen`](packages/limix-codegen/README.md) | Build-time types for the rules: registers the API's operations and the rules file's names, a starter rules file (CLI and graphql-codegen plugin) |
| [`@softistx/limix-graxia`](packages/limix-graxia/README.md) | The graxia and graphql-js integration: field guard, plugin, `@needs` checks, coverage operations |
| [`@softistx/limix-janus`](packages/limix-janus/README.md) | The `RelationChecker` adapter over janus permissions |
| [`@softistx/limix-publish`](packages/limix-publish/README.md) | The emitter: signs rules as a JWS, serves them and their JWKS (API and CLI) |
| [`@softistx/limix`](packages/limix/README.md) | The core: rules format, evaluation, relations port, coverage, remote client |

See the [package page](packages/limix/README.md) and its
[roadmap](packages/limix/docs/roadmap.md).
