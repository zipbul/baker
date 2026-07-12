# @zipbul/baker

## 6.0.0

### Major Changes

- e72460c: Compile-time rule↔field type checking, richer issues, and a leaner published surface.

  - **`@Field` is now type-checked (breaking).** A rule applied to a field of the wrong type is a compile error — `@Field(isString) age!: number` and `@Field(isString, min(5)) code!: string` no longer typecheck. Correctly typed DTOs are unaffected; runtime behaviour is identical. Dynamic/untyped rule lists remain available via `@Field({ rules: [...] })`.
  - **`BakerIssue.constraints`** now carries the failing rule's parameters (e.g. `{ min: 5 }` for `min(5)`), so you can build error messages without re-deriving bounds. Type-check rules and structural failures omit it.
  - **Internal declarations are stripped from the published types** — helper symbols that were never part of the public API no longer leak into `.d.ts`.

## 5.2.0

### Minor Changes

- f768694: Fix four correctness bugs found in a package-wide audit. Two of them change observable behavior for
  input that previously "worked", so review before upgrading:

  - **`@IsEnum` with numeric enums (behavior change).** TypeScript numeric enums compile to a reverse-mapped
    object (`{ 0: 'Inactive', 1: 'Active', Active: 1, Inactive: 0 }`), so the previous `Object.values()`
    lookup wrongly accepted the member-_name_ strings (e.g. `'Active'`) as valid values. Values are now read
    through the non-numeric keys, so only real members pass — correct for string, numeric, and heterogeneous
    enums. Input that relied on the member-name strings being accepted will now be rejected.

  - **`momentTransformer` parses in UTC (behavior change).** It now uses `moment.utc(value)` so a zoneless
    datetime string resolves to the same instant on every host; previously local-time parsing made the
    serialized output depend on the machine timezone. Zoneless inputs that were parsed in local time will now
    be parsed as UTC. Matches `luxonTransformer`'s UTC default.

  - **`luxonTransformer` invalid-date passthrough.** An unparseable date string / `Date` now passes through
    untouched instead of being laundered into an Invalid `DateTime` (which serialized to `null` /
    `"Invalid DateTime"` and corrupted data). Matches `momentTransformer`'s pass-through contract.

  - **Per-call `groups` option validation.** A non-`string[]` `groups` value now throws a clear `BakerError`
    at the call boundary instead of silently misbehaving inside the generated executor.

- 26e13af: Fix declared-collection element validation (RED tests added first), speed up collection `validate`, and
  land an internal layering cleanup. One item changes observable behavior — review before upgrading:

  - **Declared `@Type(() => Set)` / `@Type(() => Map)` now validate their elements (behavior change).** The
    declared-collection codegen path hand-rolled its per-element loop separately from the canonical
    (`type: null`) path and had three defects: a declared **Map** dropped every per-element `each` rule
    entirely; declared Set/Map `each` rules ignored the runtime `groups` filter; and a function `message` on
    an `each` rule received the whole collection as `value` instead of the failing element. All four sites
    (Set/Map × deserialize/validate) now route through one shared emitter with the same rule-major ordering,
    group filtering, per-element `value` binding, and `field[i]` paths as the canonical path. Input that was
    silently accepted because a Map's element rules never ran will now be validated.

  - **Collection `validate` is ~4.7× faster on large arrays.** The inline-nested validate path eagerly
    allocated a per-element error-path string (`field[i].`) on every element even for valid input; it is now
    built only at the (cold) error-push sites. A 1000-element nested-DTO `validate` drops from ~10µs to
    ~2.2µs (now on par with TypeBox and ahead of Ajv). `deserialize` and all error paths are byte-identical.

  - **`createRule` is now also exported from the `@zipbul/baker/rules` subpath** (it was already exported from
    the package root).

  - **`luxonTransformer` / `momentTransformer` peer-dep error is now precise.** A genuinely-missing peer still
    throws the "install it" `BakerError`; a peer that IS installed but throws during evaluation now surfaces
    its real error instead of the misleading install hint.

  Internal-only (no API change): the seal stage's TypeDef normalization was extracted out of the `sealOne`
  god-function, large static lookup tables and the `string-format` validators were split into cohesive
  modules, and several stateless helpers were simplified. Public surface is unchanged except the `createRule`
  subpath export above (verified by an export-diff).

- 96ed92c: Fix five reproduced correctness bugs (each added as a RED test first) and unify the unknown-key failure
  model. Several change observable behavior — review before upgrading:

  - **Discriminated arrays now work (was broken).** A field typed `type: () => [Base]` with a `discriminator`
    previously read the discriminator off the _array itself_ (`undefined`) and rejected every valid input with
    `invalidDiscriminator`. `deserialize`/`validate` now dispatch the discriminator switch **per element**,
    reporting nested errors at `field[i].path` and the invalid-discriminator error at the `field[i]` element
    path. (serialize already handled arrays.)

  - **serialize throws on an unmatched discriminator subtype (behavior change).** When an instance matched no
    `instanceof` branch, serialize silently emitted the raw, un-serialized object (leaking undeclared fields).
    It now throws a `BakerError`, symmetric with deserialize rejecting an unknown discriminator value.

  - **`each` rule messages receive the failing element (behavior change).** A `message`/`context` function on
    an `arrayOf(...)` rule was passed the whole collection as `value` while the path pointed at `field[i]`.
    It now receives the failing element, consistent with the element-level path.

  - **`isDateString` / `isISO8601({ strict: true })` leap-year for years 0–99.** Calendar validity used
    `new Date(year, …)`, which remaps a 0–99 year argument to 1900–1999 — so `0000-02-29` (a valid leap date
    by the 400 rule) was wrongly rejected. Now computed with the proleptic Gregorian rule for all years (and
    without allocating a `Date`).

  - **`isHash` / `isTaxId` reject an unknown algorithm/locale at construction (behavior change).** They
    previously returned a rule that always failed at runtime; they now throw a `BakerError` when called with
    an unsupported key, matching `isMobilePhone`/`isPostalCode`/`isIdentityCard`/`isPassportNumber`.

  - **`isURL` no longer shares its default-protocols array across rules.** With default protocols, every
    `isURL()` rule exposed the same module-level `['http','https','ftp']` array on `rule.constraints`;
    mutating one rule's constraints would have corrupted every other. Each rule now owns an independent copy.

## 5.1.0

### Minor Changes

- 2d61542: Baker-scoped runtime: `deserialize`/`validate`/`serialize` (plus the `*Sync`/`*Async`
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

## 5.0.0

### Major Changes

- 8ea7162: Remove the global registration API in favor of the `Baker` class. `new Baker(config?)`
  is now the only way to register and seal DTOs: use `@app.Recipe` to register a class and
  `app.seal()` to seal it. The global `@Recipe`, `seal()`, `configure()`, and the `createBaker()`
  factory have been removed — each `Baker` instance owns its own isolated registry and config, so
  multiple apps in one process never mix. `@Field`, the rule/transformer factories, and
  `deserialize`/`validate`/`serialize` are unchanged.

  Migration: replace `configure(opts)` + global `@Recipe`/`seal()` with
  `const app = new Baker(opts); @app.Recipe class Dto {}; app.seal();`.

## 4.0.0

### Major Changes

- 98c9a0a: **Breaking:** rule type hints and field exclusion are now enums instead of string literals.
  `createRule({ requiresType: 'number' })` becomes `requiresType: RequiredType.Number`, and
  `@Field({ exclude: 'serializeOnly' })` becomes `exclude: ExcludeMode.SerializeOnly`. Runtime
  behaviour is unchanged — the enums are string-valued, so generated code and validation results are
  identical; only the public type surface changed. `RequiredType` and `ExcludeMode` are now exported.

### Minor Changes

- 98c9a0a: Add `createBaker()` for multi-app isolation. Each scope owns its own registration and config, so
  multiple apps in one process — or a bundler-duplicated copy of baker — no longer fragment `seal()`
  (the previous "`<Class> is not sealed`" failure). Use:

  ```ts
  const app = createBaker({ autoConvert: true });
  @app.Recipe
  class UserDto {
    @Field(isString) name!: string;
  }
  app.seal();
  deserialize(UserDto, input);
  ```

  `@Field`, rules, and `deserialize/serialize/validate` stay global. Distinct classes are fully
  isolated (each sealed with its scope's config); a class shared across scopes is reused as one sealed
  form. Single-app code is unchanged — global `@Recipe` / `seal()` / `configure()` still work. Exports
  `createBaker` and the `Baker` type.

## 3.4.1

### Patch Changes

- 2df319e: Fix `arrayOf` emitting a duplicate `isArray` issue per element rule. When a non-collection value was
  passed to a field carrying multiple element rules, each rule pushed its own `isArray` failure, so the
  result held N identical issues instead of one. The collection-kind dispatch and the non-collection
  rejection are now computed once at the field level, so a non-array/`Set`/`Map` value reports a single
  `isArray` issue regardless of how many element rules the field declares. `validate(...)` and
  `deserialize(...)` also now agree on the reported path for inlined nested DTOs.

  Internal: the published library is now built with `bun build --no-bundle` (per-file ESM, import graph
  preserved for consumer tree-shaking, full production minify) plus `tsc` for declarations. No public API
  or runtime-behavior change — the dist is functionally identical, just smaller.

## 3.4.0

### Minor Changes

- 92028cf: Add two binary-value validation rules to `@zipbul/baker/rules`:

  - `isUint8Array` — a bare type guard (`value instanceof Uint8Array`), mirroring `isRegExp` /
    `isArray`. Accepts `Uint8Array` and its subclasses (e.g. `Buffer`); rejects `Uint8ClampedArray`,
    `DataView`, and plain arrays.
  - `isByteSize(min, max?)` — the binary analogue of `isByteLength`. Validates the `.byteLength` of
    any `ArrayBuffer.isView(v)` value (all typed arrays + `DataView`), measuring the view window
    rather than the backing buffer. The generated code guards `ArrayBuffer.isView` before any
    `.byteLength` read, so non-views fail cleanly instead of throwing.

  Both are exported from `@zipbul/baker/rules` as imported identifiers (AOT-safe), are synchronous,
  and compose inside a single `@Field(...)` — e.g. `@Field(isUint8Array, isByteSize(16), { optional: true })`
  for raw key material such as an HKDF salt.

## 3.3.1

### Patch Changes

- 8b15524: Fix `@Field({ context, message })` being dropped on non-rule-body failures. Field-level
  context/message are now first-class and attached to EVERY field-own-path failure — the type
  gate (e.g. `isInt` rejecting `NaN`/non-number), required-missing (`isDefined`), implicit
  conversion (`conversionFailed`), and structural array/object gates — plus per-element
  validation of `Set`/`Map` collections, matching the array-element behavior. Previously only
  rule-body failures (e.g. `isInt` rejecting `Infinity`) carried them, so the same field could
  emit an issue with or without `context` depending on which code path failed.

  Descendant failures (nested child fields, array/collection elements with their own rules) keep
  their own context, and `invalidDiscriminator` keeps its structural context — field context is
  not leaked across paths.

## 3.3.0

### Minor Changes

- 317e536: Add the `isStatelessRegExp` type-checker rule: a value is valid if it is a `RegExp`
  without the `g` (global) or `y` (sticky) flag. Those two flags make
  `RegExp.prototype.test`/`exec` mutate `lastIndex` across calls, so a regex carrying them
  produces order-dependent results when reused as a single-shot matcher. `isStatelessRegExp`
  rejects them at validation time (all other flags — `d`, `i`, `m`, `s`, `u`, `v` — are
  stateless and pass). It is the safe-form sibling of `isRegExp` (which is unchanged).
  Exported from `@zipbul/baker/rules`.

## 3.2.0

### Minor Changes

- 6b07d8d: Add the `oneOf` rule combinator and `arrayEvery`, `isRegExp`, `isFunction` rules.

  - `oneOf(...rules)` — OR combinator: a value is valid if it matches at least one of the
    given rules (first match wins, short-circuit). Fills baker's union-validation gap for
    native-type unions (e.g. `boolean | string | RegExp | ...`) that the object discriminator
    can't express. Sync branches compile to an inlined `||`; an async branch makes the rule
    async. Note: semantics is "matches at least one" — not JSON-Schema `oneOf` (exactly-one).
  - `arrayEvery(...rules)` — value is an array and every element satisfies all given rules.
    Composable as a rule (e.g. `oneOf(isString, arrayEvery(isString))` for `string | string[]`).
  - `isRegExp` / `isFunction` — the two missing type-checker primitives (`instanceof RegExp`,
    `typeof === 'function'`).

  All exported from `@zipbul/baker/rules`.

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
