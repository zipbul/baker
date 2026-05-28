---
"@zipbul/baker": patch
---

Fix `@Field({ context, message })` being dropped on non-rule-body failures. Field-level
context/message are now first-class and attached to EVERY field-own-path failure — the type
gate (e.g. `isInt` rejecting `NaN`/non-number), required-missing (`isDefined`), implicit
conversion (`conversionFailed`), and structural array/object gates — plus per-element
validation of `Set`/`Map` collections, matching the array-element behavior. Previously only
rule-body failures (e.g. `isInt` rejecting `Infinity`) carried them, so the same field could
emit an issue with or without `context` depending on which code path failed.

Descendant failures (nested child fields, array/collection elements with their own rules) keep
their own context, and `invalidDiscriminator` keeps its structural context — field context is
not leaked across paths.
