---
"@zipbul/baker": major
---

## Breaking Changes

- **`@Field()` unified decorator** — Replaces 30+ individual decorators with a single `@Field()` that accepts rules as arguments and options as an object.
- **Auto-seal** — `seal()` removed. DTOs auto-seal on first `deserialize()`/`serialize()` call.
- **`configure()` replaces `seal()` options** — `configure({ autoConvert, stopAtFirstError, forbidUnknown, ... })`.
- **`configure()` returns `{ warnings: string[] }`** instead of `void`.
- **`enableCircularCheck` removed** — Circular detection always runs automatically.
- **`stripUnknown` renamed to `forbidUnknown`** — `stripUnknown` kept as deprecated alias.

## Bug Fixes

- C-1: Fix analyzeAsync discriminator visited Set sharing (infinite recursion risk)
- C-2: Fix Set/Map stopAtFirstError error path missing element index
- C-3: Fix discriminator JSON Schema $ref+properties sibling (allOf wrapper)
- C-5: Throw on isDivisibleBy(0)
- C-6: Fix isURL accepting ports 65536-99999
- C-7: Fix isNumber maxDecimalPlaces scientific notation bypass
- C-8: Implement serialize discriminator with instanceof dispatch
- C-9: Fix nullable $ref invalid JSON Schema (oneOf wrapper)
- C-11: Null guard for nested array serialize
- C-12: Throw on min(NaN)/max(Infinity)
- C-13~C-17, B-1~B-11: 11 additional safety guards and silent failure fixes

## New Features

- Debug mode: `configure({ debug: true })`
- `onUnmappedRule` callback for `toJsonSchema()`
- `forbidUnknown` option (renamed from `stripUnknown`)

## Refactoring

- Decompose buildRulesCode (250 lines → 5 functions) and Field() (125 lines → 4 helpers)
- Deduplicate Array/Set/Map each codegen, extract GEN constants, strategy pattern for nullable/optional
- 1730 tests, 2509 assertions, 99.94% Funcs / 99.83% Lines
