# Relations through janus

A rule names a relation on an object (`{ relation: edit, type: document }`,
see [limix relations](https://github.com/softistx/limix/blob/develop/packages/limix/docs/relations.md)). `janusRelations` answers
it with janus's `can`, from the permission model you already wrote with
`defineModel`.

> The snippets are schematic: `model`, `access`, `policy` and `claims` are
> yours (see the README for a complete wiring).

## The mapping

Each `RelationQuery` `{ subject, relation, object }` becomes one call:

```ts
access.can({ type: subject.type, id: subject.id }, relation, { type: object.type, id: object.id })
```

(`permissions({ model, store }).can(subject, permission, object, options?)` of
`@softistx/janus/permissions`.) The rule's `relation` is read as a janus
**relation or permission** name of the object's `type`: `view` and `viewers`
both work, and the model decides what each means.

`check(queries)` runs one `can` per query concurrently (`Promise.all`) and
answers in the order of the queries. A `can` is one walk of the model; limix
asks once per rung, so a rung of two alternatives costs two walks.

## Subjects

`claims.subject` is `{ type, id }` and is passed to janus as is. When your
claims name users another way (a prefix, a type janus does not know):

```ts
janusRelations({
  access,
  subjectOf: ({ id }) => ({ type: 'user', id: id.replace('acct:', '') }),
})
```

An anonymous caller never reaches the checker: limix refuses before asking.

## Conditions (`when`)

A permission that reaches a janus `when` needs a `ctx`. Give `ctxOf`, read
from the query:

```ts
janusRelations({ access, ctxOf: (query) => ({ onShift: isOnShift(query.subject.id) }) })
```

Without `ctxOf` janus is called with no options, and such a permission throws
as in janus.

## Errors

A janus failure is never a denial. `STORE_FAILED`, `PERMISSION_DEPTH`, and the
`TypeError`s `can` throws for a relation or type the model does not declare or
an id with `@`, `#` or parentheses all propagate out of `check`, and so out of
`evaluateRest` and `evaluateField`: answer them as a server error in your
integration. A relation that simply does not hold is `false`, and limix
refuses with the rung's `onDeny`.

## Check the rules against the model

A typo in a rule (`relation: viewrs`, `type: file`) is a `TypeError` per request
at run time. `checkRulesAgainstModel(policy, model)` finds them once:

```ts
const issues = checkRulesAgainstModel(policy, model)
// [{ path: "rest['/files/:id'].GET.relations[0].require[0][0]",
//    message: 'type `file` is not a type of the janus model (it declares document)' }]
```

It lists every relation term whose `type` is not an object type of the model,
or whose `relation` is neither a relation nor a permission of that type. Empty
means consistent. Call it at startup or in a spec. Paths for REST rules carry
the pattern with `global.basePath` already prefixed.

## Limits

- **`fromField` relations**: janus reads them from fields of the object, and a
  `RelationQuery` carries only `{ type, id }`. A model whose checked
  permissions reach a `fromField` is not supported yet (see the roadmap).
- **No batching**: janus has no batched `can`, so each query is its own walk.
  A batched `can` would be a useful upstream addition; nothing is filed.
- Only `can` is read: `access.list`, `grant` and the rest stay yours.
