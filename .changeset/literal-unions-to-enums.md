---
"@zipbul/baker": major
---

**Breaking:** rule type hints and field exclusion are now enums instead of string literals.
`createRule({ requiresType: 'number' })` becomes `requiresType: RequiredType.Number`, and
`@Field({ exclude: 'serializeOnly' })` becomes `exclude: ExcludeMode.SerializeOnly`. Runtime
behaviour is unchanged — the enums are string-valued, so generated code and validation results are
identical; only the public type surface changed. `RequiredType` and `ExcludeMode` are now exported.
