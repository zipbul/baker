---
"@zipbul/baker": patch
---

Fix `arrayOf` emitting a duplicate `isArray` issue per element rule. When a non-collection value was
passed to a field carrying multiple element rules, each rule pushed its own `isArray` failure, so the
result held N identical issues instead of one. The collection-kind dispatch and the non-collection
rejection are now computed once at the field level, so a non-array/`Set`/`Map` value reports a single
`isArray` issue regardless of how many element rules the field declares. `validate(...)` and
`deserialize(...)` also now agree on the reported path for inlined nested DTOs.

Internal: the published library is now built with `bun build --no-bundle` (per-file ESM, import graph
preserved for consumer tree-shaking, full production minify) plus `tsc` for declarations. No public API
or runtime-behavior change — the dist is functionally identical, just smaller.
