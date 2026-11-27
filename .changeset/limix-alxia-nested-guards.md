---
'@softistx/limix-alxia': minor
---

The innermost guard that owns a route now judges it alone. Until now every `limixGuard` in a route's chain judged it, so an outer guard under `unmatched: 'deny'` refused the routes of a group or prefixed plugin that carried a guard of its own, whatever that guard's rules said. An outer guard now leaves a route to a later guard only when the route's chain holds that guard after it and the app that guard was given declares the same route behind it; otherwise it judges, as before. Breaking: an outer rule left for a route a group's or plugin's guard judges is no longer taken, so `checkRoutes` throws and the outer guard answers 503 `policy-mismatch`. Move those rules into the group's rules file; `alxiaOperations(group)` lists the routes to cover there. `limixGraphql` endpoints are unchanged: every guard leaves them to their field rules.
