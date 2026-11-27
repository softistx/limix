# Migrating from `@softistx/security`

`@softistx/limix` succeeds the `policy` part of `@softistx/security` 5, which
takes security fixes only. The rules format breaks wherever that simplifies it,
and there are no compatibility aliases: a 5.x document is refused with a hint
saying what to write instead. Each section below is one break, with the 5.x code
(marked "before") and the limix code that replaces it.

The TypeScript after each "after" heading is a byte copy of a file under
[`packages/limix-alxia/examples/migrating-from-security`](https://github.com/softistx/limix/tree/develop/packages/limix-alxia/examples/migrating-from-security),
which is typechecked, and run by a spec that also compares the guide with the
file. The "before" code is the 5.x documentation's own and is not compiled.

Do it in this order:

1. [Raise the peers and install](#1-packages-and-install).
2. [Rewrite the rules file](#2-the-version-key-and-unmatched), in sections [2](#2-the-version-key-and-unmatched) to [7](#7-domain-cors-ratelimit-and-providers-are-removed), then check it loads ([8](#8-loading)).
3. [Map the claims](#9-claims) and [the relations port](#12-the-relations-port).
4. Replace the guard of each transport: [REST on Hono](#19-rest-on-hono-the-recipe), [GraphQL on graxia](#17-graphql-on-graxia) or [an alxia API](#18-an-alxia-api-that-already-calls-graphqlapp-).
5. Move [the direct evaluator calls](#10-evaluaterest), [sources](#14-sources), [remote rules](#15-remote-rules) and [coverage](#16-coverage).
6. [Know what is not in limix yet](#21-not-in-limix-yet).

## 1. Packages and install

| `@softistx/security` | limix |
| --- | --- |
| `./policy` | `@softistx/limix` (and `@softistx/limix/bun` for `loadRules`) |
| `./policy/graphql` | `@softistx/limix-graxia` |
| `./policy/coverage` | `@softistx/limix/coverage`, with `graphqlOperations` in `@softistx/limix-graxia` (also on `@softistx/limix-graxia/operations`) |
| `./policy/remote` | `@softistx/limix/remote`, with `filePolicyStore` in `@softistx/limix/bun`; signing is `@softistx/limix-publish` |
| `./integrations/hono` | [the Hono recipe](#19-rest-on-hono-the-recipe) |
| `./integrations/ory`, `./integrations/*/ory`, `./integrations/*/keto` | your own `RelationChecker`, or `@softistx/limix-janus` ([12](#12-the-relations-port)) |
| `./gateway` | no counterpart yet: keep it from `@softistx/security` |

An alxia API installs `@softistx/limix-alxia` instead of the Hono recipe, and
adds `@softistx/limix-codegen` to type its rules ([20](#20-types-for-the-rules-new-optional)).

```sh
bun add @softistx/limix
bun add @softistx/limix-graxia @softistx/graxia graphql
bun add @softistx/limix-alxia @softistx/alxia @softistx/alxia-graphql
bun add @softistx/limix-janus @softistx/janus
```

Install only the lines you use. `@softistx/security` was public on npmjs; limix is
published with restricted access, so installing it needs a token that can read the
`@softistx` scope. Tell Bun to send it, in `bunfig.toml`:

```toml
[install.scopes]
"@softistx" = { url = "https://registry.npmjs.org", token = "$NPM_SOFTISTX_READ_TOKEN" }
```

Raise these first. The peers are ranges, and an install that cannot satisfy them
fails or warns before any code of yours changes:

| Package | Needs |
| --- | --- |
| `@softistx/graxia` | 0.18.0 or later, below 1.0.0 |
| `@softistx/alxia` | 0.28.0 or later, below 1.0.0 |
| `@softistx/alxia-graphql` | 0.20.2 or later, below 1.0.0 |
| `graphql` | `^17.1.0` (`@softistx/security` also accepted 16.9) |
| `@softistx/janus` (for `@softistx/limix-janus`) | 0.84.0 or later, below 1.0.0 |
| `typescript` | 6 or 7 |

Your tsconfig must resolve as a bundler does (`"moduleResolution": "bundler"`).

## 2. The version key and `unmatched`

| 5.x | limix |
| --- | --- |
| no version key | `limix: 1`, first in the document |
| `global` optional | `global` required |
| `global.unmatched` optional, default `allow` | `global.unmatched` required: `allow` or `deny` |

A path or root field no rule names was `NOT_APPLICABLE` in 5.x, which every
guard treated as open. That is `unmatched: allow` in limix, now written down. Turn
on `deny` once [coverage](#16-coverage) says every operation is named.

## 3. `authorities` becomes `roles`

`authorities` was outer AND, inner OR. `roles` is outer OR, inner AND, as
`permissions` already was in 5.x. The nesting flips, and in general you take one
entry from each group per alternative:

| 5.x `authorities` | Reads | limix `roles` |
| --- | --- | --- |
| `[[USER, ADMIN]]` | USER or ADMIN | `[[USER], [ADMIN]]` |
| `[[ADMIN], [AUDIT]]` | ADMIN and AUDIT | `[[ADMIN, AUDIT]]` |
| `[[A, B], [C, D]]` | (A or B) and (C or D) | `[[A, C], [A, D], [B, C], [B, D]]` |

Two other differences:

- `authorities` read the union of `claims.authorities`, `claims.roles` and the
  tokens of `claims.scope`. `roles` reads `claims.roles` only. A scope token you
  checked through `authorities` becomes a `permissions` term (`permissions` itself
  is unchanged: a token of `scope`, and in `claims.permissions` when that list is
  present).
- A group that mixed a role and a scope token cannot be one rule. `roles` and
  `permissions` on the same rule must both hold; for an either-or, put the test in
  a [condition](#5-expression-becomes-when-plus-a-condition-in-code) or give the
  issuer a role claim.

## 4. "Signed in" is `authenticated: true`

In 5.x a matched rule already required a signed-in caller (`sub` or `clientId`
in the claims), and `{}` or `authorities: []` meant just that. limix keeps the
floor (a matched rule that is not `public` still refuses an anonymous caller, so
a bare `{}` still means "signed in") but wants you to say it: write
`authenticated: true`. An empty `roles`, `permissions` or `when` list is refused,
because it reads as "no constraint" and means nothing. `public: true` is
unchanged, and cannot be combined with `authenticated: true`, `roles`,
`permissions`, `when` or `relations`.

## 5. `expression` becomes `when` plus a condition in code

A rules file carries no code in limix: `expression` was a JavaScript string.
The rule names a condition, and your code registers it.

<!-- before -->
```yaml
rest:
  /notes/:id:
    PATCH:
      expression:
        value: "claims.aal === 'aal2'"
```

The rule says `when: [secondFactor]`, and the condition is a function of
`{ claims, request, args, source, info }` returning a boolean (or a promise of
one). It is registered when the rules are compiled, and a name the file uses but
the code does not register fails at that point:

<!-- checked: rules.ts -->
```ts
import { compilePolicy, definePolicy } from '@softistx/limix';

export const rules = definePolicy({
	limix: 1,
	global: { unmatched: 'deny' },
	rest: {
		'/notes/:id': {
			GET: { roles: [['USER'], ['ADMIN']] },
			DELETE: { roles: [['ADMIN', 'AUDIT']] },
			PATCH: { when: ['secondFactor'] },
		},
		'/bookmarks/:id': {
			GET: {
				relations: [
					{
						require: [
							[{ relation: 'view', type: 'bookmark', from: 'param.id' }],
						],
						code: 'auth.errors.bookmark-not-found',
					},
				],
			},
		},
	},
	graphql: { Query: { me: { authenticated: true } } },
});

export const policy = compilePolicy(rules, {
	conditions: { secondFactor: ({ claims }) => claims['aal'] === 'aal2' },
});
```

What a condition sees, against what an expression saw:

- `claims` is limix's `Claims` ([9](#9-claims)), with any extra claim your issuer
  sent, such as `aal`.
- `request` holds `params`, `query` and `json` (REST), `args` and `source`
  (GraphQL). There is no `req.headers` or `req.cookies`: read them through `info`,
  which is the Hono context in the recipe below, the alxia context under
  `@softistx/limix-alxia` and the `GraphQLResolveInfo` under graxia. A header is
  still what the client wrote, so it proves nothing about who sent it.
- Under `@softistx/limix-alxia` a condition never sees `request.json`: the guard
  reads the body only for a relation term that reads `json.`. A check on `req.body`
  becomes a relation term with `from: json.<path>`, or moves into the handler. The
  Hono recipe below passes the parsed body, so a condition sees it there.

## 6. `keto` and `relations`

`keto` is gone, and `relations` already existed in 5.x as its neutral spelling, so
a file written with `relations` changes less:

| 5.x | limix |
| --- | --- |
| `keto` | `relations` |
| `permissions` inside a `keto` entry | `require` (already `require` under `relations`) |
| `permit` | `relation` (already `relation` under `relations`) |
| `namespace` of a term | `type` |
| `id` of a term | `from` (default `param.id` on REST, `args.id` on GraphQL, as before) |
| `message` of a rung (an i18n key) | `code` |
| `onDeny` | unchanged: `NOT_FOUND` by default, or `FORBIDDEN` |

The grammar is unchanged: `require` is outer OR, inner AND, and the rungs run in
order after the local checks, stopping at the first that fails. Three things to
know:

- A rung's `code` is the refusal's code. `@softistx/limix-alxia` refuses a code
  outside `auth.errors.` at setup, because its error format reads no other prefix
  but `tenancy.errors.`. A 5.x key such as `bookmarks.errors.not-found` becomes
  `auth.errors.bookmark-not-found`.
- The caller is `claims.subject` (`{ type, id }`). A signed-in caller without one
  gets a 403 with the reason `no-subject`, where 5.x read `claims.sub` or the
  Ory subject.
- A `relations` rule needs a `RelationChecker` ([12](#12-the-relations-port)). 5.x
  threw when a rule met a relation term with none; limix-graxia and limix-alxia
  refuse to start without one, and a direct `evaluateRest` call answers 503
  `limix.errors.unavailable` (`params.reason: 'no-relation-checker'`).

The whole document, before and after. The "after" is the one `rules.ts` above
writes in code, and the spec holds the two equal:

<!-- before -->
```yaml
rest:
  /notes/:id:
    GET:
      authorities: [[USER, ADMIN]]
    DELETE:
      authorities: [[ADMIN], [AUDIT]]
    PATCH:
      expression:
        value: "claims.aal === 'aal2'"
  /bookmarks/:id:
    GET:
      keto:
        - permissions: [[{ namespace: bookmark, permit: view, id: param.id }]]
          message: bookmarks.errors.not-found
graphql:
  Query:
    me: {}
```

<!-- checked: rules -->
```yaml
limix: 1
global:
  unmatched: deny
rest:
  /notes/:id:
    GET:
      roles: [[USER], [ADMIN]]
    DELETE:
      roles: [[ADMIN, AUDIT]]
    PATCH:
      when: [secondFactor]
  /bookmarks/:id:
    GET:
      relations:
        - require: [[{ relation: view, type: bookmark, from: param.id }]]
          code: auth.errors.bookmark-not-found
graphql:
  Query:
    me: { authenticated: true }
```

## 7. `$domain`, `cors`, `rateLimit` and `providers` are removed

- `$domain` in an authority (REST only, replaced by the `:domain` path parameter)
  is gone: per-tenant roles are not in 1.0.
- `cors`, `rateLimit` (global and per rule) and `global.providers` validated and
  were never enforced. They are refused now, so remove them.

Every removed key fails with a message saying what to write instead. The table is
in [Rules](rules.md#what-was-removed-from-softistxsecurity-5).

## 8. Loading

In 5.x `loadRulesFromEnv` and `parseRules` returned a compiled policy. In limix
`parseRules` validates and returns the document (`Rules`), `loadRules(path)` (in
`@softistx/limix/bun`, Bun only) reads a `.yaml`, `.yml` or `.json` file and
validates it, and you call `compilePolicy` yourself, which is also where the
conditions are registered. The environment variable is yours to read:

<!-- before -->
```ts
import { loadRulesFromEnv } from '@softistx/security/policy';

const policy = await loadRulesFromEnv({ envVar: 'RULES_FILE', fallbackPath: 'rules.yaml' });
```

<!-- checked: load.ts -->
```ts
import { compilePolicy } from '@softistx/limix';
import { loadRules } from '@softistx/limix/bun';

export async function loadPolicy() {
	return compilePolicy(
		await loadRules(process.env['RULES_FILE'] ?? 'rules.yaml'),
		{
			conditions: { secondFactor: ({ claims }) => claims['aal'] === 'aal2' },
		},
	);
}
```

## 9. Claims

A 5.x `PolicyClaims` literal is Kratos- and OIDC-shaped (`sub`, `authorities`,
`roles`, `scope`, `aal`, ...), and the caller counts as signed in when `sub` or
`clientId` is set. limix's `Claims` says it outright:

| `PolicyClaims` | `Claims` |
| --- | --- |
| `sub` or `clientId` set | `authenticated: true` (required: `false` for an anonymous caller) |
| `sub` | `subject: { type, id }`, what the relations port is asked about |
| `authorities` and `roles` | `roles`, read by `roles` only |
| `scope`, `permissions` | unchanged |
| any other claim (`aal`, `email`, ...) | kept: a condition reads it |

<!-- before -->
```ts
import type { PolicyClaims } from '@softistx/security/policy';

const claims: PolicyClaims = { sub: 'user-1', authorities: ['ADMIN'] };
```

`claimsFromOryPrincipal` has no counterpart: map your own credential. The
function below is the whole job for a token with a `sub`, some `roles` and a
`scope`. It is also the first half of the next section:

<!-- checked: evaluate-rest.ts -->
```ts
import {
	type Claims,
	type CompiledPolicy,
	evaluateRest,
} from '@softistx/limix';

// What the 5.x `PolicyClaims` literal `{ sub, authorities }` becomes: the
// caller is `subject`, and a caller with no `sub` is anonymous.
export function claimsOf(
	token: { sub?: string; roles?: string[]; scope?: string } | undefined,
): Claims {
	if (token?.sub === undefined) return { authenticated: false };
	return {
		authenticated: true,
		subject: { type: 'user', id: token.sub },
		roles: token.roles ?? [],
		...(token.scope === undefined ? {} : { scope: token.scope }),
	};
}

export async function mayDelete(
	policy: CompiledPolicy,
	claims: Claims,
	id: string,
) {
	const decision = await evaluateRest(policy, {
		method: 'DELETE',
		path: `/notes/${id}`,
		claims,
	});
	if (decision.allow) return { status: 200 };
	return { status: decision.refusal.status, code: decision.refusal.code };
}
```

## 10. `evaluateRest`

A direct call changes shape. The input loses `type: 'rest'`, `req` becomes
`request` (`params`, `query` and `json`), and the result is a `Decision` instead of
a string, with the refusal's code and status ready to answer with:

<!-- before -->
```ts
import { loadRulesFromEnv, evaluateRest } from '@softistx/security/policy';

const policy = await loadRulesFromEnv({ envVar: 'RULES_FILE', fallbackPath: 'rules.yaml' });

const result = await evaluateRest(policy, {
	type: 'rest',
	method: 'GET',
	path: '/users/123',
	claims: { sub: 'user-1', authorities: ['ADMIN'] },
});
// result.decision: 'ALLOW' | 'DENY' | 'NOT_APPLICABLE' | 'UNAUTHENTICATED'
```

The `mayDelete` function above is the limix call. How the results map:

| 5.x `decision` | limix |
| --- | --- |
| `ALLOW`, `NOT_APPLICABLE` | `{ allow: true }` |
| `UNAUTHENTICATED` | `{ allow: false }`, 401 `auth.errors.unauthenticated` |
| `DENY` | 403 `auth.errors.forbidden`; from a relations rung, 404 with its `code` or `auth.errors.not-found` (`onDeny: NOT_FOUND`), or 403 with its `code` or `auth.errors.forbidden` (`onDeny: FORBIDDEN`) |
| the guards' 503 while a source held no policy | 503 `limix.errors.unavailable`, `params.reason: 'no-policy'`, from the evaluator itself |

`path` is the request path as served, `global.basePath` included. `route` is new:
give the pattern as the rules file spells it when your framework matched it
already. The keto dependencies (`deps`, the third argument) become `relations`,
a `RelationChecker`, in the input. `explain` (new) returns the steps of a decision,
see [Evaluation](evaluation.md).

## 11. `evaluateGraphql` becomes `evaluateField`

`operationType` is now `type`, `type: 'graphql'` goes, and `root` is new: it says
whether the type is an operation root, so `global.unmatched` governs it. It
defaults to the type being named `Query`, `Mutation` or `Subscription`.

<!-- before -->
```ts
import { evaluateGraphql } from '@softistx/security/policy';

const result = await evaluateGraphql(policy, {
	type: 'graphql',
	operationType: 'Mutation',
	field: 'updateNote',
	claims: { sub: 'user-1', authorities: ['ADMIN'] },
	args: { id: 'n1' },
});
```

<!-- checked: evaluate-field.ts -->
```ts
import {
	type Claims,
	type CompiledPolicy,
	evaluateField,
	isLimixRefusal,
} from '@softistx/limix';

export async function mayUpdate(
	policy: CompiledPolicy,
	claims: Claims,
	id: string,
) {
	const decision = await evaluateField(policy, {
		type: 'Mutation',
		field: 'updateNote',
		claims,
		args: { id },
	});
	return decision.allow ? 'allowed' : decision.refusal.code;
}

// A resolver that throws a refusal of its own is recognised the same way.
export function onError(error: unknown) {
	return isLimixRefusal(error)
		? { code: error.code, status: error.status }
		: undefined;
}
```

## 12. The relations port

The 5.x port was a function over a Keto-shaped query. limix's is an object with
a `check` method over a `{ type, id }` shape, called once per rung with every query
of that rung, and answering one boolean per query, in order:

| 5.x | limix |
| --- | --- |
| `RelationChecker = (queries) => Promise<boolean[]>` | `{ check(queries): Promise<boolean[]> }` |
| query `{ namespace, object, relation, subject }` | query `{ subject: { type, id }, relation, object: { type, id } }` |
| `subject` a string or a subject set | `subject` is `claims.subject` |
| `permissions: oryRelations()` on a guard | `relations` on the integration's options: the checker, or a function of the context |

<!-- before -->
```ts
type RelationChecker = (queries: RelationQuery[]) => Promise<boolean[]>;
interface RelationQuery { namespace: string; object: string; relation: string; subject: PolicySubject }
```

There is no Ory or Keto adapter. To keep Keto, write the few lines that spell a
query for it. Over janus there is nothing to write: `janusRelations` from
[`@softistx/limix-janus`](https://github.com/softistx/limix/blob/develop/packages/limix-janus/README.md)
is the adapter.

<!-- checked: relations.ts -->
```ts
import type { RelationChecker } from '@softistx/limix';

// `ask` is your backend: one string per question, one boolean per string.
// For janus, use `janusRelations` from `@softistx/limix-janus` instead.
export function relationsOver(
	ask: (tuples: readonly string[]) => Promise<boolean[]>,
): RelationChecker {
	return {
		check: (queries) =>
			ask(
				queries.map(
					({ object, relation, subject }) =>
						`${object.type}:${object.id}#${relation}@${subject.type}:${subject.id}`,
				),
			),
	};
}
```

The [Relations guide](relations.md) covers where an id is read from and what a
list of ids does.

## 13. Refusals

`PolicyRefusal` (an `HTTPException` with `errorCode`, `messageKey` and
`debugMessage`) and the `GraphQLError` of the GraphQL guard are replaced by one
`LimixRefusal` with `code`, `status` and `params`, recognised by `isLimixRefusal`
across copies of the package. A refusal's reason never reaches the client, as
before: `params.reason` is the refusal's own, safe to show.

| 5.x `errorCode` | `messageKey` | limix `code` | `status` |
| --- | --- | --- | --- |
| `UNAUTHENTICATED` | `errors.unauthenticated` | `auth.errors.unauthenticated` | 401 |
| `FORBIDDEN` | `errors.forbidden` | `auth.errors.forbidden` | 403 |
| `NOT_FOUND` | `errors.not-found` | `auth.errors.not-found` | 404 |
| `SERVICE_UNAVAILABLE` | `errors.service-unavailable` | `limix.errors.unavailable` | 503 |

Translate the `code` where you translated the `messageKey`. A rung's own `code`
takes the place of its `message`.

## 14. Sources

`policySource(impl)` and the `PolicySource` shape are unchanged. A source now holds
a compiled policy rather than raw rules:

| 5.x | limix |
| --- | --- |
| `staticPolicySource(raw, { profile })` | `staticSource(compiled)` |
| `policySource(impl)` | `policySource(impl)` |
| a hand-written source that you replace | `mutableSource()`, then `swap(next)`; `swap(null)` withdraws |
| `parseRules(raw, { profile: 'restricted' })` | no counterpart in 1.0 (it is under "Later" on the [roadmap](roadmap.md)) |

<!-- before -->
```ts
import { staticPolicySource } from '@softistx/security/policy';

const fixed = staticPolicySource({ rest: { '/me': { GET: { authenticated: true } } } });
```

<!-- checked: sources.ts -->
```ts
import { mutableSource, staticSource } from '@softistx/limix';
import { policy } from './rules';

// was: staticPolicySource(raw)
export const fixed = staticSource(policy);

// New: a source you swap by hand (`swap(null)` withdraws the policy).
export const live = mutableSource();
live.swap(policy);
```

## 15. Remote rules

`remotePolicy` changes three option names and gains one, and a pulled file is now
in the limix format:

| 5.x | limix |
| --- | --- |
| `url` | `rulesUrl` |
| `token` | `authToken` (a string, or a function called on each pull) |
| `typ` required | `typ` optional, default `limix-rules+jwt` |
| none | `conditions`: the predicates the pulled rules' `when` may name |
| `filePolicyStore` from `./policy/remote` | `filePolicyStore` from `@softistx/limix/bun` |

<!-- before -->
```ts
import { remotePolicy, filePolicyStore } from '@softistx/security/policy/remote';

const policy = remotePolicy({
	url: 'https://policy.example.com/tenants/acme/rules',
	audience: 'billing-api',
	typ: 'rules+jwt',
	issuer: 'https://policy.example.com',
	token: () => process.env.POLICY_TOKEN ?? '',
	store: filePolicyStore('/var/lib/billing/policy.json'),
});
```

<!-- checked: remote.ts -->
```ts
import { filePolicyStore } from '@softistx/limix/bun';
import { remotePolicy } from '@softistx/limix/remote';

export function rulesFromServer(token: () => string) {
	return remotePolicy({
		rulesUrl: 'https://policy.example.com/tenants/acme/rules', // was: url
		audience: 'billing-api',
		issuer: 'https://policy.example.com',
		authToken: token, // was: token
		store: filePolicyStore('/var/lib/billing/policy.json'),
		// The rules pulled may name only these conditions: a remote file carries no code.
		conditions: { secondFactor: ({ claims }) => claims['aal'] === 'aal2' },
		onError: (error) => console.warn('policy pull failed', error.code),
		// No `typ`: it defaults to `limix-rules+jwt`.
	});
}
```

The publisher moves too. The `rules` claim must be a limix document (`limix: 1`),
and the token's `typ` header must equal the `typ` option: re-sign with
[`@softistx/limix-publish`](https://github.com/softistx/limix/blob/develop/packages/limix-publish/README.md),
which writes the default `limix-rules+jwt`, or keep passing your own `typ`. The 5.x
restricted profile is gone, so a pulled document may use the whole grammar (`roles`,
`when` names you registered), and `unmatched` is whatever the document says. See
[Remote rules](remote.md).

## 16. Coverage

`coverage` took strings (`'GET /api/things/{id}'`, `'Query.me'`) and answered with
four lists of strings. It now takes operation objects, and the report is richer:

| 5.x | limix |
| --- | --- |
| `'METHOD /path'` | `{ kind: 'rest', method, path }`, the path as the rules file spells it (`rulesPathOf` converts an OpenAPI `{id}`) |
| `'Type.field'` | `{ kind: 'graphql', type, field, root }` |
| `{ covered, public, uncovered, stale }` | `{ operations, stale, summary }`: each operation has a `status` and a `label` |
| `CoverageCheckOptions.placeholder` | gone: a route's parameters are never substituted |
| `graphqlOperations(schema)` from `./policy/coverage` | `graphqlOperations` from `@softistx/limix-graxia/operations` |
| `unnamedOperations(policy, app.routes)` | `coverage(policy, alxiaOperations(app))` |

<!-- before -->
```ts
import { coverage, graphqlOperations } from '@softistx/security/policy/coverage';
import { parseRules } from '@softistx/security/policy';

const policy = parseRules(rawRules);
const report = coverage(policy, [
	...graphqlOperations(schema),
	'GET /api/things/{id}',
]);
expect(report.uncovered).toEqual([]);
expect(report.stale).toEqual([]);
```

<!-- checked: coverage.ts -->
```ts
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { coverage } from '@softistx/limix/coverage';
import { alxiaOperations } from '@softistx/limix-alxia';
import { graphqlOperations } from '@softistx/limix-graxia/operations';

const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny' },
		rest: { '/notes/:id': { GET: { authenticated: true } } },
		graphql: { Query: { me: { authenticated: true } } },
	}),
);

const app = alxia().get('/notes/:id', ({ reply }) => reply(200, {}));

export const report = coverage(policy, [
	...alxiaOperations(app),
	...graphqlOperations('type Query { me: String }'),
]);

// Each is a list of labels such as `GET /notes/:id` or `Query.me`: assert both are empty.
export const uncovered = report.operations
	.filter((entry) => entry.status === 'uncovered')
	.map((entry) => entry.label);
export const stale = report.stale.map((rule) => rule.label);
```

A Hono app has no route table limix reads: list its operations by hand, or from an
OpenAPI document with `openapiOperations` of
[`@softistx/limix-codegen`](https://github.com/softistx/limix/blob/develop/packages/limix-codegen/README.md).
The [Coverage guide](coverage.md) has the rest.

## 17. GraphQL on graxia

`applyGraphqlPolicy(schema, rawRules, options)` wrapped a schema's resolvers.
limix-graxia has `guardSchema` for the schema and a plugin for the claims:

<!-- before -->
```ts
import { applyGraphqlPolicy } from '@softistx/security/policy/graphql';

const schema = applyGraphqlPolicy(rawSchema, rawRules, {
	getClaims: (context) => (context as { claims: PolicyClaims }).claims,
	logger: console,
});
```

<!-- checked: graxia.ts -->
```ts
import { createGraxia } from '@softistx/graxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { guardSchema, limixGraxia } from '@softistx/limix-graxia';
import { buildSchema } from 'graphql';

const schema = buildSchema(`
  type Query { me: String  notes: [String!] }
  type Mutation { retire(id: ID!): Boolean }
`);

const options = {
	policy: compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			graphql: {
				Query: { me: { authenticated: true }, notes: { public: true } },
				Mutation: { retire: { permissions: [['notes:retire']] } },
			},
		}),
	),
	// was: getClaims. Read once per operation, from what your `context` option returned.
	claims: (ctx: { request: Request }) => ({
		authenticated: ctx.request.headers.has('authorization'),
		scope: ctx.request.headers.get('x-scope') ?? '',
	}),
};

export const graxia = createGraxia({
	schema: guardSchema(schema, options), // was: applyGraphqlPolicy(schema, rawRules, { getClaims, permissions, logger, strict })
	plugins: [limixGraxia(options)],
	context: ({ request }: { request: Request }) => ({ request }),
});
```

The option names move:

| 5.x | limix-graxia |
| --- | --- |
| `getClaims(context)` | `claims(ctx)`: read once per operation by the plugin, and may be async |
| `permissions(context)` | `relations`: a `RelationChecker`, or a function of the context |
| `strict` (default `true`) | `nonNull`: `'refuse'` by default, `strict: false` is `nonNull: 'allow'` |
| `logger` | `onUnavailable`, called once each time a source stops holding a policy; refusals are no longer logged |
| `fieldResolver`, `subscribeFieldResolver` | none: a governed field without a resolver uses `defaultFieldResolver` |
| a `PolicySource` in place of raw rules | `policy` takes a `CompiledPolicy` or a `PolicySource` |

What a client sees changes too. The error's `message` is the refusal's code (it was
the i18n key), `extensions.code` is that code (it was `FORBIDDEN` and the like),
and `extensions.status` is new. A refused top-level field answers its HTTP status
(401, 403, 404, or 503 with `retry-after`), where 5.x answered a 200 with the error
in `errors` (a 503 outage aside); a refused nested field still answers a 200. A
subscription starts with no `source`, so a rule whose relation reads `source.` is
refused at setup. The [GraphQL guide](https://github.com/softistx/limix/blob/develop/packages/limix-graxia/docs/graphql.md)
has the claims, subscriptions, outages and setup checks, and
[`checkNeeds`](https://github.com/softistx/limix/blob/develop/packages/limix-graxia/docs/needs.md)
compares a schema's `@needs` with the rules.

## 18. An alxia API that already calls `graphql(app, ...)`

`limixGraphql` is alxia-graphql's `graphql()` with the rules in front of every
field, and `limixGuard` judges the REST routes by the same rules. Give both **the
same `limix` options object**:

<!-- before -->
```ts
graphql(app, { schema, plugins });
```

<!-- checked: alxia.ts -->
```ts
import { alxia } from '@softistx/alxia';
import { compilePolicy, definePolicy } from '@softistx/limix';
import { type LimixAlxiaOptions, limixGuard } from '@softistx/limix-alxia';
import { limixGraphql } from '@softistx/limix-alxia/graphql';
import { buildSchema } from 'graphql';

const schema = buildSchema('type Query { me: String }');
export const app = alxia();

const limix: LimixAlxiaOptions<{ request: Request }> = {
	policy: compilePolicy(
		definePolicy({
			limix: 1,
			global: { unmatched: 'deny' },
			rest: { '/notes/:id': { GET: { authenticated: true } } },
			graphql: { Query: { me: { authenticated: true } } },
		}),
	),
	claims: (ctx) => ({
		authenticated: ctx.request.headers.has('authorization'),
	}),
	app,
};

// Before the routes it judges: a route declared above it stays open.
app.use(limixGuard(limix));
app.get('/notes/:id', ({ reply }) => reply(200, { note: true }));

// was: graphql(app, { schema: applyGraphqlPolicy(schema, rawRules, { getClaims }), plugins })
limixGraphql(app, { schema, limix }); // the same `limix` object as the guard
```

`limixGraphql` takes every `graphql()` option, plus `limix`. Three rules:

- Declare `limixGuard` before the routes it judges. A route declared above it, such
  as a health probe, stays open; `checkRoutes` flags a rule that only reaches such
  a route.
- One guard holds one rules file, and its policy must fit every schema served
  behind it: `guardSchema` refuses a rule on a field the schema lacks. An app that
  serves two schemas with different fields gives each its own guard, on a group
  ([groups](https://github.com/softistx/limix/blob/develop/packages/limix-alxia/docs/alxia.md#groups)).
- Refusals are answered in the app's error format. A rung `code` must sit under
  `auth.errors.`.

The [alxia guide](https://github.com/softistx/limix/blob/develop/packages/limix-alxia/docs/alxia.md)
covers middleware order, tenants, outages and bodies.

## 19. REST on Hono, the recipe

limix ships no Hono package: the middleware is the dozen lines below, on top of
`evaluateRest`. It plays the part of `policyGuard` and its error handler together.

<!-- before -->
```ts
app.use('/api/*', async (c, next) => {
	c.set(POLICY_CLAIMS_KEY, await verify(c.req.header('authorization')));
	await next();
});
app.use('/api/*', policyGuard(rawRules));

app.onError((err, c) =>
	PolicyRefusal.is(err)
		? c.json({ message: err.messageKey, code: err.errorCode }, err.status)
		: c.json({ message: 'errors.internal' }, 500),
);
```

<!-- checked: hono.ts -->
```ts
import {
	type Claims,
	type CompiledPolicy,
	compilePolicy,
	definePolicy,
	evaluateRest,
	type PolicySource,
	type RelationChecker,
} from '@softistx/limix';
import { Hono } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

type Env = { Variables: { claims: Claims } };
const ANONYMOUS: Claims = { authenticated: false };

// was: policyGuard(rawRules, { getClaims }) and an `app.onError` for PolicyRefusal.
export function limixHono(
	policy: CompiledPolicy | PolicySource,
	relations?: RelationChecker,
) {
	return createMiddleware<Env>(async (c, next) => {
		// A relation term reading `json.` needs the body; Hono caches it for the handler.
		const json = c.req.header('content-type')?.includes('json')
			? await c.req.json().catch(() => undefined)
			: undefined;
		const decision = await evaluateRest(policy, {
			method: c.req.method,
			path: c.req.path,
			claims: c.get('claims') ?? ANONYMOUS,
			request: { query: c.req.query(), json },
			relations,
			info: c, // what a `when` condition receives as `info`
		});
		if (decision.allow) return next();
		const { code, status, params } = decision.refusal;
		return c.json(
			Object.keys(params).length > 0 ? { code, params } : { code },
			status as ContentfulStatusCode,
		);
	});
}

const policy = compilePolicy(
	definePolicy({
		limix: 1,
		global: { unmatched: 'deny', basePath: '/api' },
		rest: { '/notes/:id': { GET: { authenticated: true } } },
	}),
);

export const app = new Hono<Env>();

// Your authentication middleware (here: the bearer is the user id).
app.use('/api/*', async (c, next) => {
	const token = c.req.header('authorization')?.replace(/^Bearer /, '');
	c.set(
		'claims',
		token
			? { authenticated: true, subject: { type: 'user', id: token } }
			: ANONYMOUS,
	);
	await next();
});
app.use('/api/*', limixHono(policy));
app.get('/api/notes/:id', (c) => c.json({ id: c.req.param('id') }));
```

Two things to keep. The path is matched as served, so spell `/api` in the rules or
set `global.basePath`, as the example does. And `c.req.json()` is cached by Hono,
so the handler still reads the body the middleware parsed. The middleware answers
a refusal itself, so there is no `onError` branch to write; put the claims on the
context before it, from your own authentication.

## 20. Types for the rules (new, optional)

[`@softistx/limix-codegen`](https://github.com/softistx/limix/blob/develop/packages/limix-codegen/README.md)
registers your API's operations and the names in your rules file, so `definePolicy`
refuses a path, a method, a GraphQL field or a condition the API does not have. It
is a build-time tool, for CI:

```sh
limix-codegen generate --openapi openapi.yaml --graphql schema.graphql --rules rules.yaml --check
```

## 21. Not in limix yet

- `gatewaySecret` (`@softistx/security/gateway`): keep importing it from
  `@softistx/security`, which takes security fixes.
- The restricted profile: a remote or stored document has no stricter grammar than
  a local one. It is under "Later" on the [roadmap](roadmap.md).
- Ory and Keto adapters: not planned. Relations go through the port ([12](#12-the-relations-port)).
- `PolicyLogger`: limix has none. Decisions are not logged by the guards, and
  `explain` returns the steps of a decision. `remotePolicy` still takes a `logger`.
