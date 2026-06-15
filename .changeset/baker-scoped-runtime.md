---
"@zipbul/baker": minor
---

Baker-scoped runtime: `deserialize`/`validate`/`serialize` (plus the `*Sync`/`*Async`
variants) are now methods on a `Baker` instance — `app.deserialize(Dto, input)`. Each
baker compiles its own executor per class into its own map, so the **same class sealed by
two bakers with different configs behaves per each baker's config** — apps in one process
never mix. An undecorated subclass resolves to its nearest sealed ancestor within that
baker. Same-config bakers transparently share one compiled executor via a `(class, config)`
cache (compile once, no behavior change).

**BREAKING CHANGE:** the global `deserialize`/`validate`/`serialize` functions (and their
`*Sync`/`*Async` variants) are removed from the package entry, along with the published
`SEALED` symbol (`RAW` remains on `@zipbul/baker/symbols`). Migrate `deserialize(Dto, input)`
to `app.deserialize(Dto, input)` on the `Baker` instance that sealed the class.
