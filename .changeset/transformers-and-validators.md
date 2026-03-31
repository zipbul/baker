---
"@zipbul/baker": minor
---

feat: Transformer interface, built-in transformers, isULID, isCUID2

### Breaking Changes

- `FieldOptions.transform` now accepts `Transformer | Transformer[]` instead of function
- `FieldTransformParams`, `FieldTransformFn` types removed — use `Transformer` interface
- `transformDirection` option removed — use passthrough in the unused direction method
- Serialize direction applies transforms in reverse order (codec stack)

### New Features

- `Transformer` interface with separate `deserialize`/`serialize` methods
- `transform` option accepts arrays — serialize applies in reverse order
- `type` + `transform` combination support in serialize (nested serialize → transform)
- 9 built-in core transformers: trim, toLowerCase, toUpperCase, round, unixSeconds, unixMillis, isoString, csv, json
- 2 optional peer transformers: luxon, moment (async factory, `await import()`)
- `isULID()` validator
- `isCUID2()` validator
- `@zipbul/baker/transformers` subpath export

### Improvements

- `when` callback typed as `(obj: Record<string, any>)` instead of `any`
- Sourcemap removed from build output
- README rewritten with GEO optimization (FAQ, benchmarks, comparison tables)
- package.json description and keywords optimized
