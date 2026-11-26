# Relations

A role says what a caller is. A relation says what a caller may do to **one
object**: "may this user edit this document?". The rules name the relation and
where the object's id is in the request; your code answers through the
`RelationChecker` port. Janus is the first adapter (`@softistx/limix-janus`, planned, see the roadmap);
anything that can answer a boolean works.

> The snippets of these guides are schematic: where one uses a name it does not
> define (`claims`, `relations`, `policy`, `myBackend`), read it as yours.

## In the rules

```yaml
limix: 1
global:
  unmatched: deny
rest:
  /documents/:id:
    PUT:
      relations:
        - require: [[{ relation: view, type: document }]]
        - require: [[{ relation: edit, type: document }]]
          onDeny: FORBIDDEN
graphql:
  Mutation:
    updateNote:
      relations:
        - require: [[{ relation: edit, type: note, from: args.input.noteId }]]
```

A rung is `require` (disjunctive normal form: outer OR, inner AND), `onDeny`
and `code`. Rungs run in order and the first that fails answers:

- `onDeny: NOT_FOUND` (the default) answers 404 with `auth.errors.not-found`: the
  same answer as for an id that does not exist, so a caller cannot tell the
  two apart.
- `onDeny: FORBIDDEN` answers 403 with `auth.errors.forbidden`, for a second
  rung on an object the caller can already see.
- `code` replaces the code of either answer. Put it under `auth.errors.` for
  `@softistx/alxia-access` to read it.

The 404-then-403 ladder is two rungs: "can you see it?", then "may you edit it?".

## The port

```ts
import type { RelationChecker } from '@softistx/limix'

const relations: RelationChecker = {
  async check(queries) {
    // one boolean per query, in order
    return Promise.all(queries.map(({ subject, relation, object }) =>
      myBackend.can(subject, relation, object)))
  },
}
```

A `RelationQuery` is `{ subject, relation, object }`, with the subject taken
from `claims.subject` and the object `{ type, id }`, the shape janus uses.

The checker is called **once per rung**, with every query of that rung (all
terms of all alternatives) in a single batch, so a rung is one round trip. It
must answer exactly one boolean per query, in order; only `true` counts. A
rule's rungs are asked after its local checks (sign-in, roles, permissions,
`when`), so a request refused locally never reaches the backend.

Pass it to the evaluator:

```ts
const decision = await evaluateRest(policy, {
  method: 'PUT',
  path: '/documents/42',
  claims,           // claims.subject = { type: 'user', id: 'u1' }
  relations,
})
```

## Where the id is read

A term's `from` names it; it defaults to `DEFAULT_FROM` (`param.id` on REST,
`args.id` on GraphQL).

| Where | `from` | Reads |
| --- | --- | --- |
| REST | `param.<name>` | `request.params` (the captures of the pattern written in the rules) |
| REST | `query.<name>` | `request.query` |
| REST | `json.<path>` | `request.json`, dotted: `json.doc.id` |
| GraphQL | `args.<path>` | the field arguments: `args.input.noteId` |
| GraphQL | `source.<path>` | the parent value |

```ts
// PUT /bookmarks  { "bookmarkId": "b1" }   from: json.bookmarkId
await evaluateRest(policy, { method: 'PUT', path: '/bookmarks', claims, relations,
  request: { json: { bookmarkId: 'b1' } } })
```

- A value that is a list gives one query per element, and the relation must
  hold on every one.
- An id is a non-empty string. A path that resolves none (missing, empty, not a
  string) makes that term not hold, which denies the rung (with its `onDeny`)
  without calling the checker.
- A rule with relations and a signed-in caller with no `claims.subject` answers
  403 `auth.errors.forbidden` with `params.reason: 'no-subject'`; an anonymous
  one answers 401.
- A rule with relations and no `relations` passed answers
  `limix.errors.unavailable` (503): it fails closed.
- A checker that throws makes the evaluation throw; one that answers the wrong
  number of booleans throws `limix: the RelationChecker answered N for M queries`.
