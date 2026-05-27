---
"@zipbul/baker": minor
---

Add the `isStatelessRegExp` type-checker rule: a value is valid if it is a `RegExp`
without the `g` (global) or `y` (sticky) flag. Those two flags make
`RegExp.prototype.test`/`exec` mutate `lastIndex` across calls, so a regex carrying them
produces order-dependent results when reused as a single-shot matcher. `isStatelessRegExp`
rejects them at validation time (all other flags — `d`, `i`, `m`, `s`, `u`, `v` — are
stateless and pass). It is the safe-form sibling of `isRegExp` (which is unchanged).
Exported from `@zipbul/baker/rules`.
