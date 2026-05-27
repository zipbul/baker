# @zipbul/baker

## 3.1.0

### Minor Changes

- c40834b: Add `isOrigin` and `isCorsOrigin` string rules for RFC 6454 §6.2 serialized-origin
  validation. `isOrigin` accepts only the canonical WHATWG URL `.origin` form (rejecting
  trailing slash, path/query/fragment, uppercase scheme/host, explicit default ports,
  userinfo, and raw IDN — punycode required) plus the opaque `'null'` literal. `isCorsOrigin`
  is the CORS superset that additionally accepts the `'*'` wildcard. Both work standalone
  (`isOrigin('https://a.com')`) and as `@Field` rules.

## 3.0.1

### Patch Changes

- ea40a75: Docs/metadata accuracy: every README example now includes the required `@Recipe` decorator
  (without it `seal()` does not register the class and `deserialize` throws), drop the
  unnecessary `() => Set as any` / `Map as any`, state the Bun-only requirement (Bun ≥ 1.3.13),
  and replace unsubstantiated speed multipliers with honest qualitative claims. Refresh the
  package description and remove the now-redundant MIGRATION-3.0.md (its content lives in the
  CHANGELOG 3.0.0 entry).

## 3.0.0

### Major Changes

- 421fd54: 3.0 — error system redesign and API hardening (breaking).

  **Error channel.** A single `BakerError` class is now thrown for every developer/config/schema
  misuse (it carries `cause`). The validation-result types are renamed for clarity:

  - `SealError` → `BakerError` (the thrown class)
  - the field-error interface `BakerError` → `BakerIssue`
  - `BakerErrors` → `BakerIssueSet`
  - `isBakerError` → `isBakerIssueSet`

  The split is now explicit: **throw `BakerError`** for misuse discoverable without input;
  **return `BakerIssueSet`** for external-input validation failures from `deserialize`/`validate`.

  **API hardening.** `validate(Class, input)` is DTO-only (the ad-hoc `validate(value, ...rules)`
  mode was removed — call a rule directly instead). `configure()` rejects unknown keys and
  post-`seal()` calls, and seal-time options can no longer be passed per-call.

### Minor Changes

- 421fd54: Add the `isHttpToken` rule — validates the RFC 9110 §5.6.2 HTTP `token` production
  (`1*tchar`), used for HTTP method names and header field-names. Usable as a predicate
  (`isHttpToken(value)`) or as `@Field(isHttpToken)`, and exported from `@zipbul/baker/rules`.

### DX reform — breaking changes

- **Auto-seal removed.** Call `seal()` once at app startup, after every DTO module is loaded. Without it, the first `deserialize` / `serialize` / `validate` call throws `BakerError`.
  - Migration: import `seal` and call `seal()` once before any deserialize/serialize/validate call. For tests, call `seal()` after each `unseal()` / `configure(...)` reconfiguration.
- **Per-call options are validated.** Only `groups` is a valid per-call option. Passing any other key (`stopAtFirstError`, `autoConvert`, `allowClassDefaults`, `forbidUnknown`, `debug`, …) throws `BakerError`. Move those keys into `configure({...})` before `seal()`.
- **`@Field` argument validation.** Passing a non-rule value (e.g. `@Field(isNumber)` instead of `@Field(isNumber())`) now throws `BakerError` immediately with the four valid forms listed in the message.
- **Map non-string keys.** Serializing a `Map<K, V>` whose key is not a `string` throws `BakerError` — previously the key was silently coerced via `[object Object]` and collided.

### API additions

- `seal(...classes?)` — explicit AOT seal trigger.
- `deserializeSync<T>` / `deserializeAsync<T>` / `serializeSync<T>` / `serializeAsync<T>` / `validateSync` / `validateAsync` — strict variants. `*Sync` throws `BakerError` when the DTO is async on the relevant direction; `*Async` always returns `Promise`.

### Defect fixes

- **F-1** `circular-analyzer.walk()` now walks `meta.type.collectionValue` — Set/Map nested DTO cycles are caught at seal time, no more `stack overflow` at runtime.
- **F-2** Discriminator / Set·Map / inheritance invariants now run before codegen via the new `validate-meta` pass — invalid metadata throws `BakerError` with a precise message instead of producing invalid generated JS.
- **F-3** Discriminator default branch now reports `context: { received, validSubTypes: [...] }` so callers can show the user the allowed values.
- **F-4** Per-call options other than `groups` are rejected with `BakerError` instead of being silently dropped.
- **F-8** FR passport regex now anchors both ends (`/^[A-Z0-9]{9}$/i`).
- **F-9** `MAGNET_URI_RE` is anchored on the trailing end.
- **N-3** Circular-detection `WeakSet` is now allocated per call via `Symbol.for('baker:circular-seen')` threaded through `_opts` — concurrent async calls no longer false-circular on shared input objects.
- **N-4** `extractCode` checks `Object.hasOwn(input, key)` before reading — prototype-chain values no longer leak into DTO results.
- **N-6** `mergeInheritance` validation dedup now compares by `ruleName`, so a child redeclaring the same rule (e.g. `minLength(5)`) replaces the parent's rule instead of producing duplicate errors.

### Dead code

- `src/functions/_run-sealed.ts` removed. The corresponding internal-only tests in `test/e2e/change-coverage.test.ts` were dropped — their coverage is now provided by public-API tests.

## 2.2.0

### Minor Changes

- 78d701a: feat: validate-only executor with inline nested code generation

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

## 2.1.0

### Minor Changes

- 5696199: feat: Transformer interface, built-in transformers, isULID, isCUID2

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

## 2.0.0

### Major Changes

- 5d01955: feat!: v2 API overhaul — isBakerError, validate, performance optimization

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

## 1.1.0

### Minor Changes

- b27cdf6: ## New Features

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
