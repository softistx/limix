---
'@softistx/limix-codegen': minor
---

`generate` reads the rules file against the operations it was given (`--rules` with `--openapi` or `--graphql`) and reports each rule that reaches none: a key that names no route, a rule shadowed by an earlier one, a type or a field the schema does not have. Without `--check` these are warnings on stderr and the exit code stays 0; with `--check` they fail the run (exit 1) together with an out-of-date file.

Upgrade note: a `generate --check` in CI that passed before can now exit 1, because an exact key that names nothing (`"GET /notez"`) is reported too. Fix the key, remove the rule, or add the operation to the spec; the new troubleshooting entries give each message. REST rules are judged only with `--openapi` and GraphQL rules only with `--graphql`.

`init --flat` writes one key per operation (`"GET /notes"`, `"Query.me"`); `starterRules` takes an optional third argument `{ flat }` and its two-argument call is unchanged. A guide to writing rules, `docs/writing-rules.md`, covers generating, typed `definePolicy` with flat and nested keys, the patterns, what the types and `--check` catch, and CI.
