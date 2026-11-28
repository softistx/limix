# Books and authors, guarded by limix

A small API that serves **REST and GraphQL from one alxia app**, with one
policy written in code ([`src/policy.ts`](src/policy.ts)) deciding who may
reach each route and each field. It is runnable, tested, and written to be
read: the policy carries comments, and the README walks through it.

It shows:

- `limixGuard` in front of the REST routes and `limixGraphql` in front of the
  GraphQL fields, both given the **same `limix` options object** (policy and
  claims), so the two transports cannot disagree about who is calling;
- a code-first, type-safe policy: `definePolicy` takes nested and flat
  spellings side by side, a pattern, a method wildcard, roles and permissions
  in disjunctive normal form, a named `when` condition, `Type.*` wildcards and
  a rule on a field of a non-root type;
- typed rules: `limix-codegen` writes `src/generated/limix.ts` from
  `openapi.yaml` and `schema.graphql` (the operations a path, method, type or
  field must name), the roles and permissions are declared by hand in
  `src/vocabulary.ts`, the condition names come from the `conditions` object,
  and CI checks the generated file is current;
- coverage: a spec fails when a route or a root field has no rule.

The package `@softistx/limix-example-books` is private: it is never published
and has no changeset.

## Run it

From the repository root:

```sh
bun install
bun run build          # the packages: the example imports their dist
bun install            # again, to link the limix-codegen bin `generate` needs
cd examples/books
bun run start          # http://localhost:3000, PORT=8080 to change it
bun run test           # generated-file check, then the specs
```

## The demo users

`Authorization: Bearer <name>`, read by [`src/demo-claims.ts`](src/demo-claims.ts):

| Bearer | Roles | Scope | Notes |
| --- | --- | --- | --- |
| (none, or an unknown name) | none | none | anonymous |
| `reader` | `reader` | `books:read` | signed in, may not write |
| `alice` | `editor` | `books:read books:write` | owns `b1` and `b3` |
| `bob` | `editor` | `books:read books:write` | owns `b2` |
| `admin` | `admin` | `books:read books:write` | everything |

**This is a demo.** Anybody can send `Bearer admin`. A real service verifies a
signed token and builds the claims from it; limix trusts whatever `claims`
returns.

## Try it

REST:

```sh
curl localhost:3000/books                                   # public: 200
curl -X POST localhost:3000/books -H 'content-type: application/json' \
  -d '{"title":"The Lathe of Heaven","year":1971,"authorId":"a1"}'   # anonymous: 401
curl -X POST localhost:3000/books -H 'authorization: Bearer reader' \
  -H 'content-type: application/json' \
  -d '{"title":"X","year":2000,"authorId":"a1"}'                     # reader: 403
curl -X POST localhost:3000/books -H 'authorization: Bearer alice' \
  -H 'content-type: application/json' \
  -d '{"title":"The Lathe of Heaven","year":1971,"authorId":"a1"}'   # editor: 201
curl -X PUT localhost:3000/books/b1 -H 'authorization: Bearer alice' \
  -H 'content-type: application/json' -d '{"title":"Mine"}'          # her book: 200
curl -X PUT localhost:3000/books/b2 -H 'authorization: Bearer alice' \
  -H 'content-type: application/json' -d '{"title":"Not mine"}'      # bob's: 403
curl localhost:3000/admin/stats -H 'authorization: Bearer admin'     # 200 (alice: 403)
```

GraphQL (`POST /graphql`):

```sh
gql() { curl -s localhost:3000/graphql -H 'content-type: application/json' \
  ${2:+-H "authorization: Bearer $2"} -d "{\"query\":\"$1\"}"; echo; }

gql '{ books { title author { name } } }'                  # public
gql '{ me }'                                               # anonymous: 401, auth.errors.unauthenticated
gql '{ me }' reader                                        # { "me": "reader" }
gql '{ author(id: \"a1\") { name email } }' alice          # email: null, auth.errors.forbidden
gql '{ author(id: \"a1\") { name email } }' admin          # the email
gql 'mutation { updateBook(id: \"b2\", title: \"X\") { title } }' alice   # not her book: 403
gql 'mutation { deleteBook(id: \"b1\") }' alice            # admin only: 403
gql 'mutation { deleteBook(id: \"b1\") }' admin            # { "deleteBook": true }
```

A refused top-level field answers with its HTTP status; a refused nested field
(`Author.email`) answers 200 with the error in `errors` and the field null.

## Layout

| File | What it holds |
| --- | --- |
| [`src/policy.ts`](src/policy.ts) | The policy, for REST and GraphQL, and the `ownsBook` condition |
| [`src/vocabulary.ts`](src/vocabulary.ts) | The role and permission names, declared by hand |
| [`openapi.yaml`](openapi.yaml), [`schema.graphql`](schema.graphql) | The API's two contracts; codegen and coverage read them |
| [`src/app.ts`](src/app.ts) | The alxia app: guard, REST routes, GraphQL endpoint |
| [`src/demo-claims.ts`](src/demo-claims.ts) | The demo decoder: replace it |
| [`src/schema.ts`](src/schema.ts), [`src/store.ts`](src/store.ts) | The resolvers and the in-memory data |
| [`src/generated/limix.ts`](src/generated/limix.ts) | Generated: the operations of the API |
| `src/*.spec.ts` | REST statuses per user, GraphQL refusals, coverage |

## Reading `src/policy.ts`

The format is described in [rules.md](../../packages/limix/docs/rules.md); the
way to write and type a policy in [writing-rules.md](../../packages/limix-codegen/docs/writing-rules.md).
A rules file (YAML or JSON) holds the same document in its nested spelling; the
flat keys below exist in `definePolicy` only, which nests them in document
order.

1. **`global.unmatched: 'deny'`.** The policy is the list of what the service
   exposes: a route or root field no rule names is refused (401 for an
   anonymous caller, 403 for a signed-in one). Coverage keeps the list honest.
2. **Public reads.** `public: true` lets anonymous callers through.
   Rules apply in document order, first match wins: `GET /admin/health` is
   public and written before the `* /admin/*` wildcard, which would otherwise
   take it and ask for an admin. (`/health` is a path of its own, no wildcard
   reaches it.)
3. **Nested and flat REST keys.** `'/books': { GET }` with its methods under
   it, and `'POST /books'` as one key, mean the same thing and mix freely;
   choose by what reads best. A flat key joins the nested path written just
   above it; `definePolicy` refuses a move that would jump over a rule that
   could answer the same request, and a rule written twice.
4. **Roles and permissions in DNF.** `roles: [['editor'], ['admin']]` is
   "editor OR admin"; each inner list is an AND. `permissions: [['books:write']]`
   reads the caller's `scope`. Both must hold. The names are checked against
   [`src/vocabulary.ts`](src/vocabulary.ts): `'editr'` does not compile.
5. **A pattern.** `GET /authors/:id/books` has a parameter in the middle;
   `:id` is one segment.
6. **A named `when` condition.** `ownsBook` is code, in the `conditions` object
   of `policyFor`, given to `definePolicy` (which types `when` from its keys and
   never calls it) and to `compilePolicy` (which runs it). It reads the book id
   from `param.id` over REST and from `args.id` in GraphQL. `when` only narrows,
   so the condition lets the admin through itself.
7. **A method wildcard.** `'* /admin/*'` takes every method under `/admin`
   (`GET /admin/stats`, `DELETE /admin/cache`). `/admin/*` does not take
   `/admin` itself; write `/admin{/*}` for both.
8. **GraphQL.** `'Query.me'` is the flat spelling, `Mutation: {…}` the nested
   one. `'Mutation.*'` is every mutation with no rule of its own; the exact
   `deleteBook` beats it wherever it is written, and is stricter (admin only)
   than the REST `DELETE`.
9. **A non-root type.** `'Author.email'` guards the field wherever an `Author`
   appears, through `book { author { email } }` too. The field is nullable so
   that a refusal nulls it and leaves the author: limix refuses at setup a
   named non-null field, since its refusal would null the parent
   (`nonNull`, in [the graxia guide](../../packages/limix-graxia/docs/graphql.md#the-non-null-rule)).

## Keeping it current

```sh
bun run generate     # rewrite src/generated/limix.ts
bun run check:limix  # the CI check, also the first step of `bun run test`
```

`check:limix` fails when the committed types are out of date. Add a route: put
it in `openapi.yaml`, run `generate`, write its rule in the block of `src/policy/` it belongs to; the
coverage spec stays green only if the rule exists, and fails on a rule that
reaches no operation (a typo, a removed route, a shadowed rule).
