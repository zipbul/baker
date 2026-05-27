---
"@zipbul/baker": minor
---

Add the `oneOf` rule combinator and `arrayEvery`, `isRegExp`, `isFunction` rules.

- `oneOf(...rules)` — OR combinator: a value is valid if it matches at least one of the
  given rules (first match wins, short-circuit). Fills baker's union-validation gap for
  native-type unions (e.g. `boolean | string | RegExp | ...`) that the object discriminator
  can't express. Sync branches compile to an inlined `||`; an async branch makes the rule
  async. Note: semantics is "matches at least one" — not JSON-Schema `oneOf` (exactly-one).
- `arrayEvery(...rules)` — value is an array and every element satisfies all given rules.
  Composable as a rule (e.g. `oneOf(isString, arrayEvery(isString))` for `string | string[]`).
- `isRegExp` / `isFunction` — the two missing type-checker primitives (`instanceof RegExp`,
  `typeof === 'function'`).

All exported from `@zipbul/baker/rules`.
