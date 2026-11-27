# Troubleshooting `@softistx/limix-janus`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies.

## can: "<relation>" is not a relation or a permission of <type>

A rule names a relation the janus model does not declare for that type. It is
thrown from `janusRelations(...).check`, so from `evaluateRest` or
`evaluateField`. Find every such term at startup, then fix the rule or the model:

```ts
checkModel(policy, model) // [{ kind, path, message }]
```

## can: "<type>" is not an object type of the model

A rule's `type` is not an object type of the janus model. Same cure as above.
The same message also fires for a subject type the model lacks (a wrong
`subjectOf`).

## can: the object id must be a non-empty string without @, # or parentheses

The id read from the request (`from`) cannot name a janus object. Janus throws
rather than denying. Validate the id in the route (a pattern, a schema) or catch
the error where you map exceptions to a status.

## type `<type>` is not a type of the janus model

A `checkModel` issue of kind `unknown-type`: the rules name a `type` the model lacks. The
issue's path says which rule and term.

## `<relation>` is neither a relation nor a permission of `<type>`

A `checkModel` issue of kind `unknown-relation`: the type exists but has no such relation or
permission. The message lists the names it declares.

## StoreFailure / STORE_FAILED

The relation store could not answer (database down, timeout). It is never a
denial: it propagates out of the evaluators. Map it to a 503 in your
integration; limix does not catch it.

## can: checking <type>#<permission> crossed more than <n> relations without an answer

`PERMISSION_DEPTH`: a janus walk went past `maxDepth` (a cycle in the data, or a deep nesting).
Propagates like `STORE_FAILED`. Read janus's own documentation for the limit.

## can: <type>.<permission> reaches a condition, and no ctx was passed — pass { ctx }

The permission reaches a janus `when` and `can` was given no `ctx`. Pass `ctxOf`:

```ts
janusRelations({ access, ctxOf: (query) => ({ onShift: true }) })
```

## can: <type>.<relation> reads <field>, which the object does not carry — pass the loaded object, spread

The relation is a janus `fromField`, read from a field of the object, and the
adapter sends `{ type, id }` only. Not supported yet: see Limits in
[janus.md](janus.md#limits) and the `load` option on the [roadmap](roadmap.md).
`checkModel` reports a term naming such a relation directly.

## can: the subject id must be a non-empty string without @, # or parentheses

The subject's id (`claims.subject.id`, after `subjectOf`) cannot name a janus
subject. Map it with `subjectOf`, or refuse the token upstream.

## can: the subject must be a user, or { type, id }

`subjectOf` (or the claims) produced something that is neither. Return
`{ type, id }`.

## limix-janus: access.can answered <type>, not a boolean

The `can` you passed answered something other than `true` or `false` (a
wrapper that returns a decision object, a mock). Pass janus's own `can`, or
make the wrapper answer a boolean.

## `<relation>` of `<type>` is read from a field (fromField), which is not supported

A `checkModel` issue of kind `from-field`: the rules name a relation janus reads from a
field of the object. See the entry above.

## Install note: peer `@softistx/janus`

The adapter accepts `@softistx/janus` `>=0.84.0 <1.0.0`. An older minor lacks
`./permissions`; a 1.0 is not covered until a release of this package says so.
