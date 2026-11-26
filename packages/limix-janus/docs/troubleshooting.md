# Troubleshooting `@softistx/limix-janus`

Each entry is headed by the text you see. Search this page for the words of
your message. `<...>` stands for the part that varies.

## can: "<relation>" is not a relation or a permission of <type>

A rule names a relation the janus model does not declare for that type. It is
thrown from `janusRelations(...).check`, so from `evaluateRest` or
`evaluateField`. Find every such term at startup, then fix the rule or the model:

```ts
checkRulesAgainstModel(policy, model) // [{ path, message }]
```

## can: "<type>" is not an object type of the model

A rule's `type` is not an object type of the janus model. Same cure as above.

## can: the object id must be a non-empty string without @, # or parentheses

The id read from the request (`from`) cannot name a janus object. Janus throws
rather than denying. Validate the id in the route (a pattern, a schema) or catch
the error where you map exceptions to a status.

## type `<type>` is not a type of the janus model

A `checkRulesAgainstModel` issue: the rules name a `type` the model lacks. The
issue's path says which rule and term.

## `<relation>` is neither a relation nor a permission of `<type>`

A `checkRulesAgainstModel` issue: the type exists but has no such relation or
permission. The message lists the names it declares.

## STORE_FAILED

The relation store could not answer (database down, timeout). It is never a
denial: it propagates out of the evaluators. Map it to a 503 in your
integration; limix does not catch it.

## PERMISSION_DEPTH

A janus walk went past `maxDepth` (a cycle in the data, or a deep nesting).
Propagates like `STORE_FAILED`. Read janus's own documentation for the limit.

## A permission with a condition throws instead of answering

The permission reaches a `when` and `can` was given no `ctx`. Pass `ctxOf`:

```ts
janusRelations({ access, ctxOf: (query) => ({ onShift: true }) })
```

## Peer dependency `@softistx/janus` not satisfied

The adapter is built against `@softistx/janus` 0.84. Install that minor.
