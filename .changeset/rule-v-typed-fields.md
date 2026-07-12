---
"@zipbul/baker": major
---

Compile-time rule↔field type checking, richer issues, and a leaner published surface.

- **`@Field` is now type-checked (breaking).** A rule applied to a field of the wrong type is a compile error — `@Field(isString) age!: number` and `@Field(isString, min(5)) code!: string` no longer typecheck. Correctly typed DTOs are unaffected; runtime behaviour is identical. Dynamic/untyped rule lists remain available via `@Field({ rules: [...] })`.
- **`BakerIssue.constraints`** now carries the failing rule's parameters (e.g. `{ min: 5 }` for `min(5)`), so you can build error messages without re-deriving bounds. Type-check rules and structural failures omit it.
- **Internal declarations are stripped from the published types** — helper symbols that were never part of the public API no longer leak into `.d.ts`.
