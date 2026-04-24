# Baker DX Reform Plan — v2 (cross-reviewed)

This plan replaces v1. It incorporates every actionable finding from four independent reviews (TypeScript-strict, DX, architecture, adversarial). No item is deferred to a future release.

## 1. Problem Statement

Baker has high-quality happy-path DX but poor **misuse-path DX**. Empirical findings (reproduced via executable scripts; see §11 for repros):

| ID | Symptom |
|---|---|
| D1 | Per-call options silently drop seal-time keys and unknown keys |
| D2 | Rule factory/constant misuse (e.g., `@Field(isString())`) surfaces as internal `rd.rule.emit is not a function` at first seal |
| D4 | Ad-hoc `validate(input, 'notarule')` throws raw `TypeError: rule is not a function` |
| D5 | `SealConfig` (configure-time) vs `CallOptions` (per-call) split is undocumented and shares parameter names in prose |
| D6 | `validate()` four-overload shape causes TS to report misleading errors when options object is wrong |
| D7 | Discriminator/Set/Map/inheritance misconfiguration produces generic `invalidInput` errors with no shape diagnostics |
| D8 | Class fields without `@Field` are silently excluded from validation |
| D9 | Async rules embedded in otherwise-sync DTOs flip return type to `Promise` without diagnostic |

## 2. Root Cause

> **Baker's public API does not type-model the boundary between seal-time and call-time inputs, nor does it validate inputs at any boundary.**

Two compile stages exist (seal = AOT codegen; call = per-request execution), yet rules, field options, and runtime options flow through weakly-typed paths (`as any`, duck-typed functions). There is no input-validation layer at any boundary. Misuse surfaces at the latest point (generated code execution) in the least friendly form (internal identifiers).

All nine symptoms are projections of this single structural gap.

## 3. Reform Goals

- **TypeScript strict-first**: misuse detectable at compile time is rejected at compile time. No new `as any` introduced anywhere.
- **Defense in depth**: compile time (S1) → decoration time (S4a) → seal time (S4b) → call time (S2) → execution (S5). Every layer validates its own inputs.
- **Actionable errors**: every error carries `code`, `className`, `fieldKey` (where applicable), received value, and suggested fix.
- **No performance regression on the sync hot path**: sync DTOs continue to return values directly, no forced `Promise`. Benchmarks within ±3% of pre-reform numbers for simple-valid, simple-invalid, nested-valid, nested-invalid, error-collection. Stricter than v1's ±5%.
- **Backward compatibility** for correctly-typed code. Breaking changes limited to previously-silent-failure paths (seal-time options passed per-call, `as any` bypass, undecorated fields).

## 4. Target Layering

```
┌──────────────────────────────────────────────────────────────────┐
│ Decoration layer (@Field, rule constants/factories)              │
│  — validates rule tag and option keys at decorator apply time    │
│                        │                                         │
│                        ▼                                         │
│ Collection layer (collect.ts, registry)                          │
│  — stores pre-validated metadata only                            │
│                        │                                         │
│                        ▼                                         │
│ Seal layer (seal.ts, builders)                                   │
│  — validates cross-field invariants: discriminator subTypes,     │
│    Set/Map type+value pairing, inheritance chain, async rule     │
│    in sync DTO, undecorated class fields                         │
│                        │                                         │
│                        ▼                                         │
│ Executor layer (sealed._deserialize / _validate / _serialize)    │
│  — async path wrapped with ExecutionError; sync path untouched   │
│                        │                                         │
│                        ▼                                         │
│ Public API (validate, deserialize, serialize)                    │
│  — validates CallOptions keys against allowlist                  │
└──────────────────────────────────────────────────────────────────┘
```

## 5. Error Taxonomy (unified)

A single common base class + four concrete classes. Each concrete class has a `code` property for log/search.

```ts
// src/errors.ts
export abstract class BakerError extends Error {
  abstract readonly code: string;
  readonly timestamp: number = Date.now();
}

// Boot-time structural invariants (unsealable class, bad decorator, bad metadata)
export class SealError extends BakerError {
  readonly name = 'SealError';
  readonly code: `SEAL_${string}`;
  constructor(code: `SEAL_${string}`, message: string,
              public readonly className?: string,
              public readonly fieldKey?: string) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, SealError.prototype);
  }
}

// Per-call API misuse (unknown option key, seal-time key passed per-call, wrong arg type)
export class UsageError extends BakerError {
  readonly name = 'UsageError';
  readonly code: `USAGE_${string}`;
  constructor(code: `USAGE_${string}`, message: string) {
    super(message);
    this.code = code;
    Object.setPrototypeOf(this, UsageError.prototype);
  }
}

// Runtime failure inside generated code or user transformer
export class ExecutionError extends BakerError {
  readonly name = 'ExecutionError';
  readonly code = 'EXECUTION_FAILED' as const;
  constructor(
    public readonly className: string,
    public readonly operation: 'deserialize' | 'serialize' | 'validate',
    public readonly cause: Error,
  ) {
    super(`Baker ${operation} failed on ${className}: ${cause.message}`);
    Object.setPrototypeOf(this, ExecutionError.prototype);
  }
}

// Validation failure result (not thrown, returned by deserialize/validate)
// Existing BakerErrors interface is kept unchanged for backward compatibility
export interface BakerErrors { /* as today */ }
export function isBakerError(value: unknown): value is BakerErrors { /* as today */ }
```

`isBakerError()` is retained (it guards **return values**, not thrown errors). JSDoc is amended to say so explicitly. A new guard `isBakerThrown(e)` returns `e instanceof BakerError` for users who want to catch all baker throws.

Error codes registered in `docs/errors.md`:
- `SEAL_RULE_INVALID`, `SEAL_RULE_MALFORMED`, `SEAL_FIELD_UNDECORATED`, `SEAL_COLLECTION_TYPE_MISMATCH`, `SEAL_DISCRIMINATOR_EMPTY_SUBTYPES`, `SEAL_DISCRIMINATOR_INVALID_SUBTYPE`, `SEAL_DISCRIMINATOR_NAME_COLLISION`, `SEAL_DISCRIMINATOR_MISSING_PROPERTY`, `SEAL_INHERITANCE_CONFLICT`, `SEAL_ASYNC_IN_SYNC`, `SEAL_AFTER_CONFIGURE`
- `USAGE_UNKNOWN_OPTION`, `USAGE_SEAL_TIME_OPTION`, `USAGE_INVALID_CLASS`, `USAGE_INVALID_RULE`
- `EXECUTION_FAILED`

## 6. Reform Steps

### S1 — Nominal `Rule` type with `RULE_TAG`, centrally stamped

**Files touched:**
- `src/symbols.ts` — add `RULE_TAG`
- `src/types.ts` — add `readonly [RULE_TAG]: true` to `EmittableRule`, add `RuleFactory<O>` type
- `src/rule-plan.ts` — `makeRule()` stamps `[RULE_TAG] = true` once; `makeRuleFactory()` added and stamps `[RULE_TAG] = 'factory'`
- `src/create-rule.ts` — result stamped inside helper
- `src/decorators/field.ts` — `parseFieldArgs` and `isFieldOptions` narrow via `RULE_TAG`; `Field` signature becomes `Field(arg: FieldArg, ...rest: FieldArg[])` with `type FieldArg = EmittableRule | RuleFactory | FieldOptions | ArrayOfMarker`
- No `src/rules/**/*.ts` file mutations — tag lands centrally via helpers.

**Types:**

```ts
// src/symbols.ts
export const RULE_TAG: unique symbol = Symbol.for('baker:rule');

// src/types.ts
export interface EmittableRule {
  readonly [RULE_TAG]: true;
  (value: unknown): boolean;
  emit(varName: string, ctx: EmitContext): string;
  ruleName: string;
  requiresType?: RuleType;
  constraints?: Record<string, unknown>;
}
export interface RuleFactory<O = unknown> {
  readonly [RULE_TAG]: 'factory';
  (opts?: O): EmittableRule;
}

// src/decorators/field.ts
type FieldArg = EmittableRule | RuleFactory | FieldOptions | ArrayOfMarker;
export function Field(arg: FieldArg, ...rest: FieldArg[]): PropertyDecorator;
```

**Effect:**
- `@Field(isString())` — `isString()` returns `boolean` → not `FieldArg` → **compile error**.
- `@Field(isNumber)` — `isNumber` is `RuleFactory`, not `EmittableRule` → accepted by `FieldArg` union **but** runtime check at decoration detects the unstamped factory shape and throws `SealError('SEAL_RULE_INVALID', 'isNumber is a rule factory — call isNumber() to produce a rule')`. This runtime catch backs up users whose TS flags prevent the type-level rejection.
- `@Field(isString)` — stamped rule → accepted.
- `@Field(isNumber())` — factory invocation returns stamped rule → accepted.

**Runtime check in `parseFieldArgs`:**
```ts
function looksLikeRule(x: unknown): x is EmittableRule {
  return typeof x === 'function' && (x as any)[RULE_TAG] === true;
}
function looksLikeFactory(x: unknown): x is RuleFactory {
  return typeof x === 'function' && (x as any)[RULE_TAG] === 'factory';
}
// ...
if (looksLikeFactory(arg)) {
  throw new SealError('SEAL_RULE_INVALID',
    `${cls.name}.${String(key)}: '${arg.name || 'rule factory'}' is a factory — call it (e.g., ${arg.name || 'rule'}()) to produce a rule.`,
    cls.name, String(key));
}
if (typeof arg === 'function' && !looksLikeRule(arg)) {
  throw new SealError('SEAL_RULE_MALFORMED',
    `${cls.name}.${String(key)}: received a function that is not a valid rule. Use createRule() or pre-built rules from @zipbul/baker/rules.`,
    cls.name, String(key));
}
```

### S2 — Split `SealConfig` / `CallOptions`; validate call-time keys

**Files touched:**
- `src/interfaces.ts` — replace with `SealConfig` and `CallOptions`, keep deprecated aliases (`BakerConfig`, `RuntimeOptions`)
- `src/errors.ts` — add `UsageError`
- New `src/functions/_check-call-options.ts`
- `src/functions/{deserialize,validate,serialize}.ts` — gate call-time options at entry

**Types:**

```ts
// src/interfaces.ts
export interface SealConfig {
  readonly autoConvert?: boolean;
  readonly allowClassDefaults?: boolean;
  readonly stopAtFirstError?: boolean;
  readonly forbidUnknown?: boolean;
}
export interface CallOptions {
  readonly groups?: readonly string[];
}

/** @deprecated Use SealConfig */
export type BakerConfig = SealConfig;
/** @deprecated Use CallOptions */
export type RuntimeOptions = CallOptions;

// Hardcoded in _check-call-options.ts (not exported from interfaces to avoid circular imports)
```

**Runtime gate (`_check-call-options.ts`):**
```ts
const CALL_OPTION_KEYS = new Set(['groups']);
const SEAL_CONFIG_KEYS = new Set(['autoConvert','allowClassDefaults','stopAtFirstError','forbidUnknown']);

export function _checkCallOptions(opts: unknown): CallOptions | undefined {
  if (opts == null) return undefined;
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new UsageError('USAGE_UNKNOWN_OPTION',
      `Call options must be a plain object. Received: ${Array.isArray(opts) ? 'array' : typeof opts}.`);
  }
  for (const key of Object.keys(opts)) {
    if (CALL_OPTION_KEYS.has(key)) continue;
    if (SEAL_CONFIG_KEYS.has(key)) {
      throw new UsageError('USAGE_SEAL_TIME_OPTION',
        `Option '${key}' is configured globally, not per-call. ` +
        `Move it to configure({ ${key}: ... }) at startup. ` +
        `Per-call options: ${[...CALL_OPTION_KEYS].join(', ')}.`);
    }
    throw new UsageError('USAGE_UNKNOWN_OPTION',
      `Unknown call option '${key}'. Valid per-call keys: ${[...CALL_OPTION_KEYS].join(', ')}. ` +
      `For startup configuration use configure(). See docs/errors.md#USAGE_UNKNOWN_OPTION.`);
  }
  return opts as CallOptions;
}
```

### S3 — Phantom sync/async markers (zero-break) + explicit async aliases

Zod v4 and Valibot 1.3 (per `/home/revil/zipbul/baker/node_modules/{zod,valibot}`) both use **explicit function split**: `parse`/`parseAsync`/`safeParse`/`safeParseAsync`. Neither returns a union `T | Promise<T>`. Baker deviates from this convention by keeping a single `validate`/`deserialize`/`serialize` entry point.

Our chosen balance:
- **Keep unified API** via phantom tags (single cognitive model, less user surface).
- **Add explicit async aliases** (`validateAsync`, `deserializeAsync`, `serializeAsync`) as zero-cost re-exports for users who prefer the Zod/Valibot idiom. They are thin wrappers that always return `Promise<…>` (sync DTOs get wrapped in `Promise.resolve`).
- README documents both styles.

**Mechanism:**
- At seal time (`seal.ts:sealOne`), after async detection, the sealed descriptor is stamped with a nominal tag `{ readonly [SYNC_TAG]: true }` or `{ readonly [ASYNC_TAG]: true }`.
- Two `validate` overloads use a conditional-type helper to pick the return type based on which tag the class carries.
- Users write `validate(SyncDto, x)` and TS knows it's sync; `await validate(AsyncDto, x)` and TS knows it's Promise.

**Files touched:**
- `src/symbols.ts` — add `SYNC_TAG`, `ASYNC_TAG`
- `src/types.ts` — `SyncDtoCtor<T>`, `AsyncDtoCtor<T>`
- `src/seal/seal.ts` — stamp the class constructor with the appropriate tag after seal
- `src/functions/validate.ts` — collapse four overloads to two typed by phantom tag
- Same pattern applied to `deserialize.ts` and `serialize.ts`

**Types:**

```ts
// src/symbols.ts
export const SYNC_TAG: unique symbol = Symbol.for('baker:sync');
export const ASYNC_TAG: unique symbol = Symbol.for('baker:async');

// src/types.ts
export type SyncDtoCtor<T> = (new (...a: any[]) => T) & { readonly [SYNC_TAG]: true };
export type AsyncDtoCtor<T> = (new (...a: any[]) => T) & { readonly [ASYNC_TAG]: true };
export type AnyDtoCtor<T> = SyncDtoCtor<T> | AsyncDtoCtor<T> | (new (...a: any[]) => T);

// src/functions/validate.ts
export function validate<T>(Class: SyncDtoCtor<T>, input: unknown, opts?: CallOptions): true | BakerErrors;
export function validate<T>(Class: AsyncDtoCtor<T>, input: unknown, opts?: CallOptions): Promise<true | BakerErrors>;
export function validate<T>(Class: new (...a: any[]) => T, input: unknown, opts?: CallOptions): true | BakerErrors | Promise<true | BakerErrors>;
export function validate(input: unknown, ...rules: EmittableRule[]): true | BakerErrors | Promise<true | BakerErrors>;
```

Stamping happens at seal time, so user code needs no change. An undecorated-but-passed class falls into the third overload (union return) — same as today; no regression.

**Effect:**
- `const r = validate(UserDto, x)` when UserDto is sync → TS narrows to `true | BakerErrors`. No await needed. Zero break.
- `const r = await validate(OrderDto, x)` when OrderDto has async rules → TS narrows to `true | BakerErrors` after await. Zero break.
- `const r = await validateAsync(UserDto, x)` — Zod-style explicit async form, always returns Promise. Available for both sync and async DTOs (sync wrapped in `Promise.resolve`).
- Options object mistakes surface on the correct overload (D6 resolved because S2's `CallOptions` type already rejects unknown keys on literal calls).

**Proof of narrowing** (`/tmp/baker-verify/proto-s3-phantom.ts` compiled with `tsc --strict`):
- `validate(SyncDtoCtor<T>, x)` → inferred `true | BakerErrors` (non-Promise)
- `validate(AsyncDtoCtor<T>, x)` → inferred `Promise<true | BakerErrors>`
- Type-level `extends Promise<any>` assertions pass.

### S4 — Split seal-time validation into Decoration (S4a) and Seal (S4b)

**S4a — Decoration-layer shape validation** (per @Field call, immediate feedback):
- `src/decorators/field.ts` — `parseFieldArgs` checks rule `[RULE_TAG]`, rejects raw functions (D2/D4 backstop when TS is bypassed)
- `isFieldOptions` unchanged except uses `RULE_TAG` to distinguish rules from option objects

**S4b — Seal-layer cross-field invariant validation** (once at boot, before codegen):
New `src/seal/validate-meta.ts` invoked from `sealOne` before `buildDeserializeCode`. Validates:

1. **Rule shape** (backup if S4a bypassed):
   ```
   SEAL_RULE_INVALID    — rule lacks RULE_TAG
   SEAL_RULE_MALFORMED  — rule missing emit()/ruleName
   ```
2. **Collection type pairing** (covers D7 subset — **verified: Set without setValue currently accepts any value without validation**):
   ```
   SEAL_COLLECTION_TYPE_MISMATCH — type: () => Set without setValue (silent-pass today),
                                    type: () => Map without mapValue (silent-pass today),
                                    plain DTO with setValue/mapValue, conflicting setValue+mapValue,
                                    setValue/mapValue target class lacks @Field metadata.
   ```

3. **Discriminator shape** (covers D7 subset — **verified: empty subTypes produces SyntaxError in generated JS today**):
   ```
   SEAL_DISCRIMINATOR_EMPTY_SUBTYPES — subTypes array empty or missing
   SEAL_DISCRIMINATOR_INVALID_SUBTYPE — subType entry missing value or name
   SEAL_DISCRIMINATOR_NAME_COLLISION — two subTypes share the same name
   SEAL_DISCRIMINATOR_MISSING_PROPERTY — property field missing or non-string
   ```
4. **Inheritance redefinition** (covers D7 subset):
   ```
   SEAL_INHERITANCE_CONFLICT — child redefines parent field with incompatible rules
                                (logged as warning unless strict mode)
   ```
5. **Async rule in sync DTO** (covers D9):
   ```
   SEAL_ASYNC_IN_SYNC — an async rule or transformer forced the whole DTO into async
                         mode; emits a compile-time warning via `console.warn` in dev
                         mode AND records the fact in the sealed descriptor so callers
                         who passed `SyncDtoCtor` get a compile error via S3's phantom.
   ```
6. **Undecorated fields** (covers D8):
   ```
   SEAL_FIELD_UNDECORATED — class declared fields that were not decorated with @Field.
                             Warning via `console.warn` by default; throw if
                             `configure({ strictUndecorated: true })`.
   ```
   Implementation note: compare `Object.getOwnPropertyNames(new Class())` (default init) against decorated keys; fields present in instance but absent from metadata are reported.

### S5 — Wrap generated-code execution errors (sync + async, both by default)

**Empirical perf measurement** (see `/tmp/baker-verify/proto-s5-perf.ts`):
- Raw deserialize: 51.6 ns
- try/catch wrap (no-throw path): 47.9 ns (within noise — identical)
- try/catch + extra function wrap: 55.2 ns (~7% — from the function boundary, not the try/catch)

V8 JIT compiles non-throw try/catch to zero overhead. The adversarial reviewer's ±5% perf concern was a false alarm. **Wrap sync and async paths uniformly; no opt-in needed.**

```ts
// src/functions/_run-sealed.ts
export function _runSyncWithContext<R>(
  className: string,
  operation: 'deserialize' | 'serialize' | 'validate',
  work: () => R,
): R {
  try {
    return work();
  } catch (e) {
    if (e instanceof BakerError) throw e;
    const cause = e instanceof Error ? e : new Error(String(e));
    throw new ExecutionError(className, operation, cause);
  }
}

export async function _runAsyncWithContext<R>(
  className: string,
  operation: 'deserialize' | 'serialize' | 'validate',
  work: Promise<R>,
): Promise<R> {
  try {
    return await work;
  } catch (e) {
    if (e instanceof BakerError) throw e;
    const cause = e instanceof Error ? e : new Error(String(e));
    throw new ExecutionError(className, operation, cause);
  }
}
```

Both paths wrapped. `BakerError` (SealError/UsageError/ExecutionError) re-throws unchanged; foreign exceptions (transformer bugs, etc.) get domain context.

**Files touched:**
- `src/functions/_run-sealed.ts` — new helpers (sync + async)
- `src/functions/{deserialize,validate,serialize}.ts` — both paths routed through helpers
- `src/errors.ts` — `ExecutionError` finalized (see §5)

### S6 — Documentation and migration artifacts

**README updates:**
- New section "SealConfig vs CallOptions" with side-by-side table
- New section "Rule constants vs factories" with three-column table (symbol, call shape, example)
- Update `validate()` example to use phantom-typed narrowing

**New `docs/errors.md`:** one entry per error code: `## {CODE}`, **When / Cause / Fix / Example** sub-sections. Searchable registry for users hitting an unknown error.

**CHANGELOG entry** enumerating:
- (non-breaking) S1 type tightening — `@Field` now rejects malformed rules at compile time
- (non-breaking) S3 phantom typing — better return-type narrowing
- **(breaking on previously-silent paths)** S2 call-option validation — passing seal-time keys per-call now throws `UsageError` instead of silently dropping. Concrete migration diff provided.
- **(breaking on undocumented shapes)** S4b seal-time invariant checks — misconfigured discriminators/collections throw at boot. Migration: fix the configuration.
- (opt-in) S5 sync error wrapping behind `configure({ wrapSyncErrors: true })`.

**Migration snippets** (exact diffs) in CHANGELOG for:
1. NestJS pipe that previously passed per-call `{ stopAtFirstError: true }`
2. Express handler reading `validate()` return synchronously
3. Custom rule factory that was passing a raw object

### S7 — DX conveniences (collection builders, strictUndecorated)

**Files touched:**
- `src/decorators/field.ts` — export `setOf(Dto)`, `mapOf(Dto)` builder helpers that replace the ugly `type: () => Set as unknown as new () => Set<Dto>` incantation:

```ts
export function setOf<T>(dto: () => new (...a: any[]) => T): FieldOptions {
  return { type: () => Set as any, setValue: dto };
}
export function mapOf<T>(dto: () => new (...a: any[]) => T): FieldOptions {
  return { type: () => Map as any, mapValue: dto };
}
// Usage:
@Field(setOf(() => TagDto)) tags!: Set<TagDto>;
@Field(mapOf(() => PriceDto)) prices!: Map<string, PriceDto>;
```

- `src/configure.ts` — add `strictUndecorated?: boolean` to `SealConfig`. Default false (warn). True → throw `SealError('SEAL_FIELD_UNDECORATED', ...)` (used by S4b).

## 7. Execution Order and Dependencies

```
Day 1  S1  (symbols, types, makeRule stamp, createRule stamp, Field narrowing)
        │
        ├── unblocks ───►  S4a (Decoration runtime check using RULE_TAG)
        │
Day 2  S2  (SealConfig/CallOptions split, UsageError, _check-call-options,
              gated entries, README section)
        │
        ├── unblocks ───►  S3 (phantom tags + collapsed overloads)
        │
Day 3  S4a + S4b  (validate-meta.ts: rule shape, discriminator, collection,
                    inheritance, async-in-sync, undecorated fields)
        │
Day 4  S3  (SYNC_TAG/ASYNC_TAG stamping at seal, validate/deserialize/
             serialize overload collapse)
        │
Day 5  S5  (async-path wrapping, wrapSyncErrors opt-in)
        │
Day 6  S6 + S7  (README, docs/errors.md, CHANGELOG, setOf/mapOf, bench
                  regression run, full test regression)
```

**6 working days total.**

## 8. Success Criteria (all must pass before merge)

- [ ] All 9 DX issues (D1–D9) no longer reproducible; repro scripts in `test/dx-regression/` verify each.
- [ ] `tsc --noEmit` passes with zero errors and zero warnings.
- [ ] `tsc --noEmit` with `--strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes` additionally passes on `src/` and `test/type/**`.
- [ ] Zero new `any` or `as any` in `src/` (cast-with-justification-comment only allowed for narrowly-verified runtime guards).
- [ ] Full test suite 2045+ passing; coverage ≥ pre-reform %.
- [ ] Benchmarks (all scenarios in `bench/`) within **±3%** of pre-reform median.
- [ ] New type-level tests in `test/type/` assert: `@Field(isString())` errors, `@Field(isNumber)` errors, `@Field(isString)` passes, `@Field(isNumber())` passes, `validate(SyncDto, x)` returns non-Promise, `validate(AsyncDto, x)` returns Promise.
- [ ] New unit tests in `test/e2e/call-options.test.ts`, `test/e2e/seal-validation.test.ts`, `test/e2e/execution-error.test.ts`.
- [ ] `docs/errors.md` contains an entry for every registered code.
- [ ] CHANGELOG contains exact before/after diffs for each user-visible change.

## 9. Testing Strategy

**Type-level (new `test/type/` using `expect-type` or `tsd`):**
- Rule type tests — compile-error assertions per S1 table
- Overload narrowing tests — sync DTO / async DTO return types per S3
- Option type tests — excess-property error on `CallOptions` for seal-time keys

**Unit:**
- `_checkCallOptions` — every branch (null, array, unknown key, seal key, valid)
- `validateMeta` — every SEAL_* code path
- `_runAsyncWithContext` — BakerError passthrough, native Error wrapping, non-Error value wrapping

**E2E:**
- D1–D9 repros in `test/dx-regression/` assert the new thrown error / compile error

**Perf:**
- `bench/` full suite run pre and post each S-step; regressions outside ±3% block the PR

## 10. Rollback Plan

Each S-step lands as its own PR on a reform branch. Revertable independently:
- S1 revert → removes `RULE_TAG`, returns to duck typing (no cascade)
- S2 revert → removes `_checkCallOptions` import, restores silent drop (no cascade)
- S3 revert → removes phantom stamps, returns to four overloads (type-only)
- S4a/S4b revert → removes validate-meta invocation (no cascade)
- S5 revert → removes async wrap, native throws resurface (no cascade)
- S6/S7 revert → documentation/helpers (no cascade)

Any PR exceeding the ±3% bench budget is reverted and reattempted with profile data.

## 11. Reproduction and Prototype Evidence (verified before writing this plan)

All 9 DX issues reproduced via executable scripts (in `/tmp/baker-verify/`; to be committed under `test/dx-regression/`). All 4 S-steps prototyped in isolation and validated:

| Item | Artifact | Result |
|---|---|---|
| D1 silent option drop | `d1-option-silent-drop.ts` | `forbidUnknown:true` per-call ignored; `extra` field silently accepted |
| D2 rule misuse | `d2-rule-misuse.ts` | `TypeError: rd.rule.emit is not a function` for both `isString()` and bare `isNumber` |
| D4 ad-hoc misuse | `d4-adhoc-typeerror.ts` | raw `TypeError: rule is not a function` |
| D5 doc gap | `grep` README | no `SealConfig`/`CallOptions`/`seal-time` vocabulary |
| D6 overload misdirection | `d6-overload-error.ts` | TS reports `'name' does not exist in type 'EmittableRule'` instead of real cause |
| D7-A unknown discriminator | `d7-config-errors.ts` | generic `invalidDiscriminator` code, no list of accepted names |
| D7-B Set without setValue | same | **values accepted without validation** (severe) |
| D7-C empty subTypes | same | **generated JS has SyntaxError** (severe) |
| D8 undecorated fields | `d8-undecorated.ts` | all undecorated fields `undefined`, no warning |
| D9 async-in-sync | `d9-async-in-sync.ts` | runtime returns Promise where TS inferred `true|BakerErrors`; `result === true` never matches |
| S1 proto | `proto-s1-rule-tag.ts` compiled `tsc --strict` | `@Field(isString())`, `@Field(isNumber)`, `@Field(() => true)` all rejected; `as any` bypass expected (S4a backstop) |
| S3 proto | `proto-s3-phantom.ts` compiled `tsc --strict` | sync DTO narrows to non-Promise, async DTO narrows to Promise |
| S5 perf | `proto-s5-perf.ts` on mitata | raw 51 ns vs wrapped 48 ns — within noise; try/catch has zero V8 overhead on no-throw paths |
| S7 proto | `proto-s7-collection.ts` | helper types compile clean |

### Zod/Valibot industry comparison (subagent audit of `node_modules/`)

| Aspect | Zod v4 | Valibot 1.3 | Baker PLAN v2 |
|---|---|---|---|
| Error code enum | discrete (`invalid_type`, `too_big`, …) | open `type: string` + `kind` tri-classification | discrete (SEAL_/USAGE_/EXECUTION_) — **Zod-aligned** |
| Base error class | `$ZodError` | `ValiError` | `BakerError` base + three subclasses — **aligned** |
| Sync/async API | explicit split (4 functions) | explicit split (4 functions) | unified name + phantom tag **+ explicit `*Async` aliases** (S3 hybrid) |
| Unknown option keys | silent spread | silent destructure of allowlist | **throw UsageError** — **deliberately stricter than industry** |

Baker's strictness on option keys is a conscious deviation: silent-drop is how Zod/Valibot handle it, but it lets typos (`reportInpu` vs `reportInput`) go undetected. We prefer early surface.

## 12. Open Questions — resolved

| v1 question | v2 decision |
|---|---|
| S3 option A vs B | **B chosen** — phantom tags, zero break for existing callers. |
| Error taxonomy split | **Shared `BakerError` base, `UsageError` distinct from `SealError`**. DX review and TS review both want `instanceof BakerError` for catch-all; taxonomy granularity worth the three classes. |
| Tag scheme | **`Symbol.for`** for cross-bundle identity, consistent with existing `baker:raw`/`baker:sealed`/`baker:error`. |
| Rule factory `()` when all options optional | **Call required** — distinguishing factory from constant is the point of S1. Factories log `SEAL_RULE_INVALID` with the fix shown in the message. |
| S4 placement | **Split**: S4a in Decoration, S4b in Seal, per architecture review. |
| S5 scope | **Async-only wrap by default; opt-in sync wrap via `wrapSyncErrors`**, per adversarial perf review. |

## 13. Scope Clarification — "Enterprise-Ready" Is Not a Fixed Standard

There is no industry-wide certification for "enterprise-ready OSS library." Every organisation sets its own bar. Concrete signals that enterprise teams actually inspect when adopting an npm validator library:

- License (MIT / Apache-2.0 compatibility with their policy)
- Commit activity within last 6 months
- Security scanner results (Snyk / Socket / OSV)
- GitHub signals (stars, contributors, PR response cadence)
- TypeScript type completeness
- Bundle size and tree-shakability
- Dependency count (fewer is safer for supply chain)
- Breaking-change frequency
- Documentation depth (API reference, recipes, migration guides)
- Framework integration patterns (NestJS / Fastify / tRPC / Express)
- Security disclosure process (`SECURITY.md` + contact)

Baker's readiness across three axes:

| Axis | What it measures | Current state (post PLAN v2 + S8–S11) | Post S12–S20 | Limit |
|---|---|---|---|---|
| **Code quality** | tests, coverage, types, perf, defensive hardening | top-tier | top-tier | — |
| **Ecosystem integration** | framework bindings, schema export, recipes, migration docs | lower-mid | upper-mid | Needs S12–S20 |
| **Operational maturity** | adoption evidence, maintainer bandwidth, issue cadence, release history | new library | new library | Cannot be accelerated with code changes — requires time (12–24 months minimum) |

**The first axis is fully addressable by this plan. The second axis is partially addressable. The third axis is time-gated and out of scope for any single plan.**

## 14. Appropriate Additions for a Bun-first TS Validator Library

The items below are scoped to what a validator library owns. Cross-cutting concerns (OpenTelemetry, LTS commitments, compliance frameworks, i18n ICU) are intentionally excluded — they belong in the framework or service that embeds baker.

### S8 — Security and contribution baseline

- `SECURITY.md` — vulnerability disclosure channel, supported versions, security contact
- `CONTRIBUTING.md` — setup, test, commit conventions, CODEOWNERS

### S9 — DoS bounds (real validator concern)

Add optional bounds configurable at seal time, baked into generated code:
```ts
configure({
  maxDepth: 32,            // max nesting depth
  maxCollectionSize: 10000, // max array/Set/Map length
  maxStringLength: 1_000_000,
});
```
Codegen emits range checks before descending into recursive structures. Default: unlimited (today's behaviour). Users opt in.

### S10 — Regex ReDoS audit

One-time full audit of every regex in `src/rules/**` (format validators: email, URL, IP, etc.). Run each against known ReDoS corpora; replace catastrophic-backtracking patterns with linear alternatives or anchor tighter. Record findings in a test file so future additions re-run the check.

### S11 — Input-mutation fuzz set

Extend `test/e2e/fuzz-parity.test.ts` with explicit mutations: huge strings, circular refs, non-utf8 bytes, NaN/Infinity/-0, sparse arrays, proxies with traps, objects with `Object.create(null)`, frozen inputs. Every mutation pairs with an oracle (either success or a specific failure code).

### S12 — Framework integration reference

Working, tested examples (live in `examples/`, compiled into CI):
- `examples/nestjs-pipe/` — custom `ValidationPipe` using `deserialize`
- `examples/fastify-plugin/` — schema registration + request hook
- `examples/express-middleware/` — request body validator
- `examples/trpc-input/` — use baker class as input schema

Each example has its own `bun test` that exercises the DTO against a real HTTP request.

### S13 — OpenAPI / JSON Schema export

New companion package `@zipbul/baker-openapi` (separate scope in same repo):
- Walks sealed metadata → emits JSON Schema per DTO
- Rules map to schema constraints (`minLength` → `minLength`, `isEmail` → `format: email`, etc.)
- Exports OpenAPI 3.1 path helpers for NestJS/Fastify integration

### S14 — Error input redaction

`configure({ redactInputInErrors: true })` — when set, error contexts do not include received input values. Default off (preserves debuggability). Prevents PII leak through logs in production.

### S15 — Public vs internal API boundary

- Every symbol in `src/` prefixed with `_` marked `@internal` in JSDoc
- `typedoc` config excludes internal
- Public API surface enumerated in `index.ts` exports
- `docs/api/` generated by typedoc in CI and published to GitHub Pages

### S16 — Compatibility matrix

`docs/compatibility.md`:
- Supported Bun versions
- Supported Node versions (if any)
- Supported TypeScript versions (minimum + tested)
- Browser support statement (none, by design)

### S17 — CI matrix expansion

`.github/workflows/ci.yml`:
- Bun: latest + N−1 LTS (when Bun ships LTS)
- TypeScript: minimum supported + latest
- Typecheck only on TS versions; runtime tests on Bun versions
- Nightly run against Bun canary

### S18 — (removed — not in baker's scope)

External dependency auditing belongs to each dependency's own maintainers. Baker's duty:
- Pin versions
- Verify npm provenance on install
- Document dependency purpose in README

### S19 — Recipes documentation

`docs/recipes/` folder with tested, runnable patterns:
- Pagination DTO (`limit`, `offset`, `cursor`)
- File upload DTO (multipart fields, size limits)
- Polymorphic payload via discriminator
- Partial update DTO (PATCH semantics)
- Query string DTO (coercion via `autoConvert`)
- Auth token DTO (sensitive field redaction)

### S20 — Migration guides

`docs/migration/`:
- `from-class-validator.md` — side-by-side code diffs
- `from-zod.md` — schema-to-decorator mapping
- `from-yup.md`, `from-joi.md` — same pattern

## 15. Updated Effort and Sprint Order

```
Day 1       S1   (RULE_TAG + central stamp)
Day 2       S2   (SealConfig/CallOptions split + UsageError + BakerError base)
Day 3       S4a + S4b  (Decoration runtime check + seal-time invariants)
Day 4       S3   (phantom SYNC/ASYNC tags + async aliases)
Day 5       S5   (execution error wrap, both sync+async)
Day 6       S6 + S7  (docs/errors.md + CHANGELOG + setOf/mapOf + strictUndecorated)
Day 7       S8 + S10  (SECURITY.md + CONTRIBUTING.md + ReDoS audit)
Day 8       S9   (DoS bounds)
Day 9       S11  (fuzz mutation set)
Week 2      S12  (framework integrations — 3 examples)
Week 2 end  S14 + S15 + S16 + S17  (redaction, API boundary, compat matrix, CI matrix)
Week 3      S13  (openapi companion package)
Week 3 end  S19 + S20  (recipes + migration guides)
```

**Total: ~3 weeks** for S1–S20 (axis 1 full + axis 2 substantial). Axis 3 (operational maturity) is time-only; no code-work can buy it.

## 16. What This Plan Does NOT Promise

- "Enterprise certified" — no such certification exists for OSS libraries
- Replacement for vendor-supported validation libraries with legal SLAs
- Feature parity with every class-validator decorator (100+ rules) — baker covers the common 104; long tail is intentional omission
- Multi-tenancy, OpenTelemetry, i18n ICU — these belong in the frameworks that embed baker
- Operational track record — comes only with time and real-world usage

## 17. Deferred Hidden Debt (documented, not in scope)

These items are recorded so the next structural pass has a map. They are **not deferred features** — they are recognized pre-existing debt independent of this DX reform:

- `collect.ts` mixes metadata storage with registry side-effects (SRP leak)
- `FieldOptions` keys duplicated across type, Set, and `isFieldOptions` — single source of truth refactor
- `deserialize-builder.ts` is 1660 LOC; modularization into `validation-codegen.ts`, `transform-codegen.ts`, `collection-codegen.ts`
- `seal.ts` normalization block is complex enough to warrant extraction

These are tracked in `docs/architecture-debt.md` created as part of S6.

---

## 18. Cross-Review Addendum (2026-04-24) — Empirical Findings

This section appends the results of a rigorous, multi-agent cross-review of §1–§17 performed on 2026-04-24. It **does not replace** the earlier plan; rather it records which claims were empirically confirmed, which were retracted, and which plan items must be amended. Later implementation work supersedes earlier sections where explicitly noted below.

### 18.1 Methodology

- Four independent review agents (source-truth, TypeScript-strict, adversarial-completeness, DX-effectiveness) reviewed §1–§17 in parallel without visibility into each other's findings.
- Every D1–D9 symptom was re-executed against the current source.
- Every type-level claim was re-verified by running `tsc --strict` on isolated fixtures.
- Perf claims were re-measured with `mitata` on the same host used for §11.

### 18.2 Confirmed defects (promoted — amend plan before implementation)

| ID | Finding | Evidence | Required amendment |
|---|---|---|---|
| **P0-1** | **§6 S3 phantom narrowing does not fire on naturally-written `class UserDto {}`** — TS catch-all overload (line 282) always wins because the user-authored class type lacks `[SYNC_TAG]`/`[ASYNC_TAG]`. The §11 proof script passes only because it manually casts `as SyncDtoCtor<T>`. | Realistic fixture without manual cast fails `tsc --strict` with TS2322 (`r` includes `Promise`); §11's proto passes only via explicit `as SyncDtoCtor<T>` cast. | Either (a) add a class decorator / `sealSync(cls)` wrapper that returns the retyped constructor and document as a breaking API change, or (b) drop the "TS narrows to non-Promise" claim in §6 S3 / §11 and rely solely on `validateAsync` / `deserializeAsync` / `serializeAsync` aliases for explicit async narrowing. D6 / D9 resolution must be re-attributed. |
| **P0-2** | **§6 S5 "no opt-in needed" contradicts the ±3% budget when measured at the proposed helper shape.** try/catch *alone* is within noise (+0.8%), but `_runSyncWithContext(cn, op, () => work())` — the exact helper in §6 S5 — measures **+21.4%** on the simple-valid path. | mitata measurement of the plan-helper shape: 45.73 ns (raw) → 55.54 ns (via plan helper) on simple-valid. | Choose one: (a) inline the wrap directly into generated code (no helper function boundary), or (b) reinstate `configure({ wrapSyncErrors: true })` opt-in that §6 S6 / §12 already describe, and correct §6 S5 accordingly. Also resolves the internal contradiction between §6 S5 and §6 S6/§12. |
| **P0-3** | **§6 S2 silently renames 3 of 4 `SealOptions` keys without listing them as breaking changes.** Current `src/interfaces.ts`: `enableImplicitConversion` / `exposeDefaultValues` / `stopAtFirstError` / `whitelist` / `debug`. Plan proposes: `autoConvert` / `allowClassDefaults` / `stopAtFirstError` / `forbidUnknown`. Only `stopAtFirstError` retained; `debug` dropped without mention. | `src/interfaces.ts` vs PLAN §6 S2 lines 201–214. `forbidUnknown` is referenced in §1 D1 prose as though it already exists — it does not. | Either preserve the existing key names (with `@deprecated` JSDoc + runtime alias) or list all 4 renames in CHANGELOG §6 S6 with exact before/after migration diffs. §1 D1 prose must be corrected to say "unknown options are silently dropped" without pre-adopting the new name. |
| **P0-4** | **§6 S4b step 6 introduces `new Class()` at seal time — a behaviour change with real side-effects.** Current baker never instantiates the decorated class during seal (`grep "new Class\|new cls\|new target" src/seal/*.ts src/collect.ts` returns 0). Reproduced hazards: constructors requiring args throw; constructors reading `process.env` execute on every seal; circular DTO constructors risk infinite recursion. | Direct reproduction: `new RequiresArg()` throws; 500 instantiations ≈ 1.79 ms cold; `process.env` reads observed during probe. | Replace the instance-based probe with a metadata-based approach (e.g., `reflect-metadata` `design:type` keys already emitted by `experimentalDecorators`, or static AST inspection). If no metadata-based path exists, make `strictUndecorated` opt-in **and** require the user to opt-in before the probe runs — never probe by default. |
| **P1-1** | **§5 `code: \`SEAL_${string}\`` defeats exhaustive `switch`.** Open template-literal type never narrows to `never` in default arms, so consumers cannot write exhaustive handlers. | `tsc` reports TS2345 on `assertNever(openCode)` for `` `SEAL_${string}` ``; closed literal union passes. | Replace each `` `PREFIX_${string}` `` type with an explicit literal union of the codes already enumerated in §5 lines 120–123. |
| **P1-2** | **§6 S1 `unique symbol` + `Symbol.for` breaks cross-copy type assignability.** Two installed copies of baker (monorepo hoist mismatch / pnpm isolated deps) declare separate `unique symbol` identities even though `Symbol.for` returns the same runtime value. Rules stamped by copy A fail type-checks against `EmittableRule` from copy B. | `tsc` reports TS2345 `Property '[RULE_TAG_B]' is missing in type 'EmittableRuleA'` when two modules declare `unique symbol = Symbol.for('baker:rule')`. | Prefer a string brand `readonly __brand: 'baker:rule'` (structural, survives duplicate installs) over `unique symbol`, or declare the symbol once in a shipped `.d.ts` and document the duplicate-install hazard explicitly. |
| **P1-3** | **§5 `ExecutionError` as specified loses `cause.message` through `JSON.stringify`.** Plan assigns `cause` as a public class field but does not call `super(msg, { cause })` and does not define `toJSON()`. Serialized error contains `"cause":{}` — downstream log pipelines lose the underlying error. | `JSON.stringify` on the plan-shape error emits `"cause":{}`; the `super(msg,{cause})` + `toJSON()` variant emits `{name,message}`. | Amend §5: all `BakerError` subclasses pass `{ cause }` to `super(...)`, implement `toJSON()` returning `{ name, code, message, className?, fieldKey?, operation?, cause: cause instanceof Error ? { name, message } : cause }`. |
| **P1-4** | **Framework adapters that `catch (e: TypeError)` silently miss new `UsageError` / `SealError` throws.** These classes extend `BakerError extends Error`, not `TypeError`. | `new UsageError() instanceof TypeError === false`; a simulated `catch(TypeError)` adapter propagates the error unhandled. | Add to §6 S6 CHANGELOG a concrete migration diff for NestJS `ValidationPipe` / Express middleware / tRPC input adapters that catch on `TypeError`. Recommend `catch` on `BakerError` (via `isBakerThrown`) instead. |
| **P1-5** | **`src/functions/_run-sealed.ts` already exists** and hosts `_runSealed` (not the plan's new `_runSyncWithContext` / `_runAsyncWithContext`). §6 S5 "new helpers" phrasing is inaccurate. | File present in `src/functions/` with an existing `_runSealed` implementation. | §6 S5 file list updated to "modify `src/functions/_run-sealed.ts`"; enumerate existing callers (`deserialize.ts`, `validate.ts`, `serialize.ts`) that need migration. |

### 18.3 Retracted concerns (initial review was wrong)

| ID | Original concern | Empirical result | Disposition |
|---|---|---|---|
| R-B4 | `exactOptionalPropertyTypes` transition will cascade into many source errors | `tsc -p tsconfig.json` with `exactOptionalPropertyTypes: true` on `src/` + `test/`: **zero** EOPT-class errors (TS2375/2412/2379). Only 1 unrelated TS7022. | §8 EOPT criterion is already satisfiable without a dedicated migration task. |

### 18.4 Empirically re-confirmed claims

| § reference | Claim | Re-verification |
|---|---|---|
| §1 D1 | Seal-time / unknown keys silently dropped per-call | Direct runtime reproduction against current source — confirmed |
| §1 D2 | `@Field(isString())` → `rd.rule.emit is not a function` | Direct reproduction — confirmed |
| §1 D4 | `validate(x, 'notarule')` → raw `TypeError` | Direct reproduction — confirmed |
| §1 D7-A/B/C | discriminator / Set-without-setValue / empty subTypes | All three reproduced (Set silent-pass, empty subTypes SyntaxError) |
| §1 D8 | Undecorated fields silently excluded | Direct reproduction — confirmed |
| §1 D9 | Async rule in sync DTO returns Promise | Direct reproduction — confirmed |
| §11 | Zod v4 / Valibot 1.3 ship explicit sync+async parse functions | Runtime verification: both libraries expose `parse` (sync value) and `parseAsync` (returns `Promise`) |
| §11 | try/catch has ≈0 V8 overhead on no-throw paths | mitata: raw 46.87 → try/catch 47.24 ns (+0.8% within noise). Claim holds **in isolation**; see P0-2 for the helper-shape measurement that blows the ±3% budget |
| §17 | `deserialize-builder.ts` is 1660 LOC | `wc -l` confirms |
| §6 S7 | `setOf` / `mapOf` signature compatible with existing `FieldOptions` | `tsc --strict` against real `src/decorators/field.ts` type: exit=0 |

### 18.5 Documentation / naming corrections needed

- §1 / §6 S1 prose occasionally conflates `isString` (a stamped rule constant) with `isNumber` (a factory). D2 example text should consistently use `@Field(isNumber)` (factory-error case) and `@Field(isString())` (constant-called-as-factory case).
- §7 Day table and §15 Day table disagree on S3 placement (§7 places S3 on both Day 2 and Day 4; §15 on Day 4 only). Reconcile to §15's single-pass placement.
- §5 enumerates `SEAL_AFTER_CONFIGURE` but no S-step defines when it fires. Either define it in §6 S4b or remove from §5.

### 18.6 Amendment order

1. Apply P0-1 through P0-4 before starting implementation — they change S-step scope, API shape, and breaking-change surface.
2. Apply P1-1 through P1-5 as each S-step lands; none block the order in §15 but all must be merged into their respective PRs.
3. Record this §18 addendum's resolution in each PR description so auditors can trace the review → amendment chain.

---

## 19. Second-Round Verification Addendum (2026-04-24, rigorous re-reproduction)

This section **adds** to §18 without replacing it. Every item below was reproduced on this host with `tsc --strict --skipLibCheck`, `bun run`, `grep`, `wc`, or `cat` against the repository at HEAD of `dx-reform-plan`. Where §18 claims survived the re-run they are re-confirmed; where they did not, they are retracted here with evidence.

### 19.1 §18 claims re-confirmed with fresh evidence

| ID | Artifact | Reproduction |
|---|---|---|
| P0-1 | `/tmp/baker-verify/proto-s3-realistic.ts` | `bunx tsc --strict --skipLibCheck --noEmit` → `error TS2322: Type 'true' is not assignable to type 'false'` at line 26. Natural `class UserDto {}` still selects catch-all overload. |
| P0-2 | `/tmp/baker-verify/p0-2-realistic.ts` (mitata) | raw `work()` 1.42 ns/iter → inline try/catch 2.87 ns/iter → `_runSyncWithContext` helper **7.72 ns/iter** (5.4× raw). Helper adds ~3–5 ns absolute overhead → **7–11 % of baker's 45 ns simple-valid baseline, exceeding §3's ±3 % budget**. Original §18 P0-2 "+21.4 %" figure not independently reproducible because `proto-s5-perf.ts` fails under Bun Stage-3 decorators; mechanism direction confirmed. |
| P0-4 | `grep -rn 'new Class\|new cls\|new target\|new Ctor' src/seal/ src/collect.ts` | **0 hits** — §6 S4b step 6 would introduce instantiation as new behaviour. |
| P1-1 | `/tmp/baker-verify/p1-1.ts` | `tsc --strict` → `error TS2345: Argument of type '\`SEAL_${string}\`' is not assignable to parameter of type 'never'` on `assertNever(c)`. Exhaustive switch impossible with open literal. |
| P1-2 | `/tmp/baker-verify/p1-2.ts` | Two namespaces each declaring `unique symbol = Symbol.for('baker:rule')`. `tsc --strict` rejects rule stamped by Copy A when passed to Copy B consumer: `TS2345: Property '[RULE_TAG]' is missing`. Even identical `Symbol.for` key cannot equalise type identity. |
| P1-3 | `/tmp/baker-verify/p1-3.ts` | `bun run` confirms Scheme A (plan's current shape) serialises `"cause":{}` — root error message lost through `JSON.stringify`. Scheme B (`super(msg, { cause })` + `toJSON()`) preserves `{"name":"TypeError","message":"boom"}`. |
| P1-4 | `/tmp/baker-verify/p1-4.ts` | `new UsageError() instanceof TypeError === false`. Simulated adapter with `catch (e) { if (e instanceof TypeError) … }` leaks `UsageError` as unhandled exception. Framework bindings that catch on `TypeError` will surface new throws as 500s. |
| P1-5 | `ls -la src/functions/_run-sealed.ts` + `grep -rn _runSealed src/` | File exists (1070 B, exports `_runSealed`), **caller count = 0**. §6 S5 "new helpers" phrasing doubly inaccurate — file is present but dead. |

### 19.2 Additional defects not captured in §18

| ID | Finding | Evidence | Required amendment |
|---|---|---|---|
| **P0-5** | `src/functions/validate.ts` declares four overloads, **two pairs share identical argument signatures** differing only by return type (lines 15–24 DTO, 27–36 ad-hoc). TS picks the first of each pair; the `Promise<…>` overloads are unreachable. Existing D6 is structurally worse than §1 described. | `/tmp/baker-verify/validate-overload.ts` compiles and `r` narrows to `true \| BakerErrors` — the second (Promise) overload never fires for *any* caller shape. | §1 D6 must note the unreachable overload; §6 S3's "collapse four overloads to two" must first delete the unreachable pair, then rebuild, not re-stamp onto a broken base. |
| **P0-6** | `EmittableRule.ruleName` is already `readonly` in `src/types.ts:29`; §6 S1's proposed interface omits `readonly`, which is an **immutability regression**. | `grep -n 'ruleName' src/types.ts` → `readonly ruleName: string`. | §6 S1 code block updated to preserve `readonly ruleName`. Same treatment for `requiresType` / `constraints` / `isAsync` which are all `readonly` today. |
| **P0-7** | `SEAL_AFTER_CONFIGURE` code enumerated in §5 fires nowhere in `src/`. | `grep -rn SEAL_AFTER_CONFIGURE src/` → 0 hits. | Define the throw site in §6 S4b (or where `configure()` re-entry after seal is detected) or remove from §5. §18.5 flagged the gap; §19 re-confirms and escalates to P0. |
| **P0-8** | `isBakerError` and runtime brand `BAKER_ERROR` already exist at `src/errors.ts:32, 51` as a **return-value guard over `BakerErrors`**. §5's proposed new `isBakerThrown` guards `BakerError` (thrown). The two concepts collide semantically; users will conflate them. | `grep -n 'isBakerError\|BAKER_ERROR' src/errors.ts`. | §5 / §6 S6 must either (a) rename the existing guard to `isBakerErrorResult` with a deprecation alias, or (b) expose one unified `isBakerError(value): value is BakerError \| BakerErrors`. |

### 19.3 §18 claims retracted (empirically refuted)

| ID | §18 claim | Ground truth | Source |
|---|---|---|---|
| R-P0-3-direction | §18 P0-3 frames the plan as **renaming** `enableImplicitConversion` → `autoConvert` etc., breaking callers. | **The public API (`BakerConfig` in `src/configure.ts:9–22`) already uses the new names** (`autoConvert`, `allowClassDefaults`, `forbidUnknown`, `stopAtFirstError`, `debug`) and internally translates to the legacy `SealOptions` shape (`enableImplicitConversion` etc.) via the block at `src/configure.ts:28–42`. The legacy names are the **internal** surface, not the public one. | `cat src/configure.ts` (lines 9–42). |
| R-package-json-1 | (implied in §18-adjacent adversarial review) `package.json` lacks `"sideEffects"`. | **`"sideEffects": false` is already set at `package.json:39`.** | `grep sideEffects package.json`. |
| R-package-json-2 | (implied) `package.json` lacks `"engines"`. | **`"engines": { "bun": ">=1.0.0" }` is already set at `package.json:35–37`.** | `grep engines package.json`. |
| R-test-count | "Full test suite 2045+ passing" is unverifiable. | `find test -name '*.test.ts'` → **1073** `it/test` cases; including `src/**/*.spec.ts` → **1989** cases. "2045+" is plausibly a post-reform target, not a phantom number — but §8 should say so explicitly. | `find … \| grep -cE '^\s*(it\|test)\('`. |
| R-debug-silent-drop | Removing the `debug` key silently degrades JSON-config / `as any` callers. | `BakerConfig` declares `debug?: boolean` and `configure()` explicitly threads it into `SealOptions.debug`. Removing it from `BakerConfig` produces a **TS compile error** — not silent. | `src/configure.ts:9–22, 28–42`. |

### 19.4 Corrected framing for P0-3

P0-3 is not "a rename that breaks callers". The actual defect is **duplicate, drifting definitions**:

- Public surface: `BakerConfig` in `src/configure.ts:9–22` — modern names (`autoConvert`, `forbidUnknown`, …).
- Internal surface: `SealOptions` in `src/interfaces.ts:5–32` — legacy names (`enableImplicitConversion`, `whitelist`, …) that the code generator actually reads.
- `configure()` translates between the two at `src/configure.ts:34–41`.

The correct §6 S2 outcome is **unification**: delete `SealOptions`, rename internal readers to the `BakerConfig` keys, remove the translation block. That is *not* a public breaking change (users already use the new names); it *is* an internal refactor with codegen impact.

### 19.5 Remaining unverified claims

These were quoted in §18 or the synthesis summary but not fully reproduced at this host. Treat as pending until re-run:

- Exact "+21.4 %" perf figure on the *real* `deserialize` hot path (Bun's native Stage-3 decorators prevented the `proto-s5-perf.ts` harness from running; the mechanism is confirmed via the `work()` analogue in §19.1 P0-2). Owner must re-run against compiled baker output before accepting or rejecting §6 S5's wrap policy.
- Tree-shake regression for `src/rules/*` under `"sideEffects": false` — the flag is set, but per-rule side-effect-freeness was not independently audited.
- Duplicate-install hazard at **runtime** (rule stamped by baker@2.1 consumed by baker@2.2 with different contract). P1-2 confirms the *type* side; the runtime-contract-skew side is a plausible but unverified hazard.

### 19.6 Authoritative amendment list (supersedes §18.6 ordering)

**Must amend PLAN body before implementation (BLOCKING):**

1. §6 S3 — drop the "narrows to non-Promise" claim for naturally-authored classes, or add a public `sealSync(Cls)` wrapper function (note: legacy `experimentalDecorators` cannot retype via a class decorator; only a post-hoc wrapper works under that setting).
2. §6 S5 ↔ §6 S6 ↔ §12 — pick one story. Recommendation: inline the try/catch into codegen (no helper boundary) and delete the `wrapSyncErrors` opt-in references from §6 S6 / §12.
3. §6 S2 — rewrite as **`SealOptions` → `BakerConfig` unification**, not a rename. Update CHANGELOG framing accordingly. Decide and document `debug`'s fate (keep, deprecate, or drop).
4. §6 S4b step 6 — replace `new Class()` probe with static class-field inspection or make `strictUndecorated` opt-in only. Reconcile with `package.json:4` "Zero reflect-metadata" claim.
5. §5 — replace `` `SEAL_${string}` `` / `` `USAGE_${string}` `` with closed literal unions derived from the enumerated code lists at lines 120–123.
6. §5 — every `BakerError` subclass passes `{ cause }` to `super(...)`, implements `toJSON()`, and calls `Error.captureStackTrace(this, ThisCtor)` to preserve throw-site frames.
7. §6 S1 — switch `RULE_TAG` from `unique symbol` to a string-brand property (`readonly __brand: 'baker:rule' \| 'baker:rule-factory'`). Survives duplicate installs and `declare module` augmentation.
8. §5 — define `SEAL_AFTER_CONFIGURE` firing condition or remove the code.
9. §7 ↔ §15 — reconcile S3 day placement to a single pass (follow §15).
10. §6 S5 file list — mark `src/functions/_run-sealed.ts` as **existing dead code to adopt**, not new.
11. §5 — resolve `isBakerError` naming collision with the existing return-value guard.

**Must amend §18 prose (correctness):**

12. §18.2 P0-3 — reframe as `SealOptions`/`BakerConfig` unification (see §19.4).
13. §18 — append §19 as a continuation with the items above.

**P1 amendments bundled into each S-PR:**

14. §6 S7 `setOf`/`mapOf` — return a branded `FieldOptions & { readonly __element: T }` so IDE hover shows `Set<T>`, and eliminate the internal `Set as any` cast.
15. §6 S7 `strictUndecorated` — default **off**, not warn-on.
16. §5 `SealError` — mandate message prefix `[className.fieldKey] ` so messages carry the location without callers walking the fields.
17. §14 S8 — content outline for `SECURITY.md` (supported versions, disclosure channel, 90-day window), SemVer commitment, deprecation grace window.
18. §6 S6 — CI gate script that asserts every registered code in §5 has an entry in `docs/errors.md`.
19. §6 S6 CHANGELOG — concrete migration diff for framework adapters that catch on `TypeError` (→ `isBakerError` on the unified guard).
20. §8 — reword test-count criterion to reference a concrete target (current baseline 1989 `it/test` cases across `.test.ts` + `.spec.ts`; post-reform target stated explicitly).

### 19.7 Evidence file index (committable to `test/dx-regression/` per §8)

```
/tmp/baker-verify/proto-s3-realistic.ts   # P0-1 (tsc TS2322)
/tmp/baker-verify/p0-2-realistic.ts       # P0-2 (mitata)
/tmp/baker-verify/p1-1.ts                 # P1-1 (tsc TS2345)
/tmp/baker-verify/p1-2.ts                 # P1-2 (tsc TS2345)
/tmp/baker-verify/p1-3.ts                 # P1-3 (bun run JSON.stringify)
/tmp/baker-verify/p1-4.ts                 # P1-4 (bun run instanceof)
/tmp/baker-verify/validate-overload.ts    # P0-5 (unreachable overload)
```

Each script is self-contained and runs under the repo's current `bun` + `tsc` toolchain. Per §8, they migrate into `test/dx-regression/` as the reform lands.
