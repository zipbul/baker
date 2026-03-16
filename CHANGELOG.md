# @zipbul/baker

## 1.0.0

### Major Changes

- b7ea675: ## Breaking Changes

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

## 0.1.2

### Patch Changes

- 76657db: fix: pin CI Bun version to 1.3.9 to avoid 1.3.10 bundler regression, optimize isIn/isNotIn with Set, improve npm packaging and test coverage

## 0.1.1

### Patch Changes

- 95ce993: Add coverage badge gist configuration

## 0.1.0

### Minor Changes

- 214f664: ### Breaking Changes

  - Remove `src/aot/` module and `@zipbul/baker/aot` subpath export. The zipbul CLI now reads baker decorators directly via AST.
  - `MessageArgs.constraints` type changed from `unknown[]` to `Record<string, unknown>`.
  - Default behavior for fields without `@IsOptional`/`@IsNullable`: `undefined`/`null` input now emits `isDefined` error code instead of falling through to type gate errors (e.g., `isString`).

  ### Features

  - **`@Nested(fn, opts?)`** — Single-decorator shorthand for `@ValidateNested()` + `@Type(fn)` with discriminator support.
  - **`@IsNullable()`** — Allow `null` (skip validation), reject `undefined`. Complements `@IsOptional()` for OAS 3.0 `nullable: true` semantics.
  - **`@Schema(schema)`** — Attach JSON Schema Draft 2020-12 metadata at class or property level. Supports object and function forms.
  - **`toJsonSchema(Class, opts?)`** — Generate JSON Schema Draft 2020-12 from DTO decorators. Supports `direction`, `groups`, circular references, discriminator `oneOf`, and `@Schema()` overrides.
  - **`seal({ whitelist: true })`** — Reject undeclared fields with `whitelistViolation` error code.
  - **`@Min(n, { exclusive: true })` / `@Max(n, { exclusive: true })`** — Exclusive minimum/maximum support.
  - **`enableImplicitConversion`** — Automatic type conversion (string/number/boolean/date) based on `requiresType` and `@Type()` hints.
  - **`EmittableRule.constraints`** — All built-in rules now expose their parameters via `constraints` for JSON Schema mapping and `message` callback access.
  - **`requiresType` expansion** — Added `'boolean'` and `'date'` variants. Fixed silent rule loss for non-string/non-number `requiresType` values.

  ### Internal

  - Upgrade `@zipbul/result` from `^0.0.3` to `^0.1.4` and adopt `Result<T, E>` / `ResultAsync<T, E>` type aliases.
  - Fix seal placeholder to throw `SealError` instead of bare `Error`.
  - Remove dead branch in deserialize input type guard.
