---
"@zipbul/baker": minor
---

## New Features

- **Sync API optimization** — `deserialize()` and `serialize()` are no longer `async function`. Sync DTOs (no async transforms/rules) skip `Promise` allocation via `Promise.resolve()`. Async DTOs use the executor's native `Promise`. Return type remains `Promise<T>` for backward compatibility.

- **Map/Set auto-conversion** — New `type: () => Map` and `type: () => Set` support in `@Field()`:
  - `Set<T>`: JSON array ↔ `Set`, with optional `setValue: () => DtoClass` for nested DTOs
  - `Map<string, T>`: JSON object ↔ `Map`, with optional `mapValue: () => DtoClass` for nested DTOs
  - JSON Schema: Set → `{ type: 'array', uniqueItems: true }`, Map → `{ type: 'object', additionalProperties }`

- **Per-field error messages** — `message` and `context` options on `@Field()` apply to all rules on the field. Supports static strings, dynamic functions with `{ property, value, constraints }`, and arbitrary context values including falsy ones (`0`, `false`, `''`).

## Chores

- Translate all Korean comments and documentation to English (82 files)
- Delete REVIEW.md (all 42 items completed)
- 1808 tests, 2639 assertions
