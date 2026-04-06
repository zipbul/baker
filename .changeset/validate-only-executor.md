---
"@zipbul/baker": minor
---

feat: validate-only executor with inline nested code generation

- Add `_validate` sealed executor — validates input without Object.create or property assignment
- validate() now uses dedicated `_validate` executor instead of routing through `_deserialize`
- Inline nested DTO validation: nested DTO fields are expanded directly into the parent function body, eliminating per-item function call overhead
- Recursive inline for all nesting patterns: nested objects, arrays of nested, discriminator, collections (Set/Map), transforms, groups
- Only circular references fall back to function call (physically impossible to inline)
- 14 refs-based validators converted to inline emit (isISBN, isISIN, isIBAN, isFQDN, etc.)
- Type gate dead code removal: 11 redundant checks eliminated in gated paths
- Rule Plan IR `stripSelfComparison` for AST-level optimization inside type gates
- Shared codegen utilities extracted to `codegen-utils.ts`
- GEN constants centralized in serialize-builder to prevent typo-related bugs
- `makeRule`/`makePlannedRule` factory functions for cleaner rule creation
- Sync/async contract enforcement for declared-sync rules

Performance:
- validate() nested 3-level: 8.79ns (typebox: 11.56ns) — 1.3x faster than typebox
- validate() array 1000 items: 2.35µs (typebox: 2.37µs) — equivalent to typebox
- validate() vs deserialize(): 2-5x faster across all benchmarks
- Zero memory leaks verified under 10M sustained operations
- 26.6M ops/sec throughput (validate valid, flat DTO)
