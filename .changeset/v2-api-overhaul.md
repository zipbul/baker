---
"@zipbul/baker": major
---

feat!: v2 API overhaul — isBakerError, validate, performance optimization

### Breaking Changes

- `deserialize()` no longer throws on validation failure — returns `T | BakerErrors | Promise<T | BakerErrors>`
- `serialize()` returns directly for sync DTOs — `Record<string, unknown> | Promise<Record<string, unknown>>`
- `BakerValidationError` class removed — use `isBakerError()` type guard
- `toJsonSchema()` removed
- `@Schema` decorator and `schema` field option removed
- `JsonSchemaOverride`, `ToJsonSchemaOptions` types removed
- `BAKER_ERROR` symbol no longer exported (internal only)
- `README.ko.md` removed

### New Features

- `validate(Class, input, options?)` — DTO-level validation without instantiation
- `validate(input, ...rules)` — ad-hoc single value validation
- `isBakerError()` — type guard for narrowing validation results
- Sync DTOs return directly (no Promise wrapper) across all APIs
- Memory leak detection CI step

### Performance

- Valid path: 188ns → 38ns (5x improvement)
- Invalid path: 6.08µs → 76ns (80x improvement)

### Bug Fixes

- WeakSet circular detection false positive on same-object reuse
- serialize-builder async discriminator array syntax error
- 13 rules missing constraints in metadata
