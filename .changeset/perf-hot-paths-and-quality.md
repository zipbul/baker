---
"@zipbul/baker": minor
---

Hot-path performance overhaul, zero runtime dependencies, and a full documentation/quality pass.

- **Performance** (same machine, mitata medians): invalid-input deserialize ~2× faster (simple 102→56ns, nested 306→158ns, error-collection 102→59ns), nested-array deserialize ~1.7× faster (1000 items 16.4→9.4µs), valid paths ~25-50% faster (nested 41.7→20.4ns), per-request `groups` option validation ~15× faster, sync transforms ~1.3-1.8× faster. Generated deserialize executors now return the raw `BakerIssue[]` on failure internally, allocate error lists lazily, preallocate nested output arrays, and inline the sync-transform Promise guard.
- **Zero runtime dependencies** — `@zipbul/result` was internal-only and is removed; `bun add @zipbul/baker` pulls in nothing else.
- **New seal-time guard (behavior change):** DTO classes extending `Array` are now rejected at `seal()` with a `BakerError` — a successfully deserialized instance would otherwise be indistinguishable from a validation-failure array. Array-exotic DTOs were never a supported pattern.
- **Types:** `EmittableRule` and `WidenLiteral` are now importable from `@zipbul/baker/rules` (previously a consumer annotating a rule's type via the subpath got TS2305/TS2742).
- **Docs:** README now covers the full rule surface (Combinators/Object/Binary sections), every `BakerError` cause, the `debug` config key, the `rules` field option, and the documented error-code list gains the emitted `circular` and `isDefined` codes.
