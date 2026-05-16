# Baker 2.x → 3.x Migration

This release replaces the implicit "auto-seal on first call" model with explicit, user-triggered `seal()`. It also tightens per-call options validation and adds strict sync/async variants.

## Required changes

### 1. Call `seal()` once at app startup

**Before**

```ts
// Module load registers DTOs; first deserialize implicitly seals everything.
const r = await deserialize(UserDto, payload);
```

**After**

```ts
import { seal, deserialize } from '@zipbul/baker';
// Call after every DTO module has been imported (before HTTP server / job runner starts).
seal();
const r = await deserialize(UserDto, payload);
```

`deserialize` / `serialize` / `validate` throw `SealError` if the DTO is not sealed.

### 2. Move per-call options into `configure(...)`

Only `groups` survives as a per-call option.

**Before**

```ts
await deserialize(UserDto, payload, { stopAtFirstError: true });
```

**After**

```ts
import { configure, seal } from '@zipbul/baker';
configure({ stopAtFirstError: true });
seal();
await deserialize(UserDto, payload);
```

All other keys (`stopAtFirstError`, `autoConvert`, `allowClassDefaults`, `forbidUnknown`, `debug`) and their legacy `SealOptions` aliases (`enableImplicitConversion`, `exposeDefaultValues`, `whitelist`) now throw `SealError` when passed per-call.

### 3. `configure()` must run before `seal()`

After `seal()`, `configure(...)` throws `SealError`. Tests that need to reconfigure must call the test-only `unseal()` helper, change config, then `seal()` again.

### 4. `@Field` argument validation is strict

Passing a non-rule value (factory not invoked, primitive, plain function without `.emit` / `.ruleName`) throws `SealError` at decorator-evaluation time with the four valid forms listed.

```ts
@Field(isNumber)       // ✗ factory not invoked → SealError
@Field(isNumber())     // ✓
@Field(isString)       // ✓ constant rule
@Field()               // ✓ marker only
@Field(isString, { optional: true })       // ✓
@Field({ type: () => NestedDto })          // ✓
```

### 5. `Map<K, V>` requires string keys at serialize

Serializing a `Map` with non-string keys throws `TypeError`. Previously the key was silently coerced via `String(key)`, producing collisions like `'[object Object]'`.

### 6. New strict sync/async variants

Six new entry points enforce the call-direction asymmetry at the type level:

| Integrated | Strict sync | Strict async |
|---|---|---|
| `deserialize` | `deserializeSync` | `deserializeAsync` |
| `serialize` | `serializeSync` | `serializeAsync` |
| `validate` | `validateSync` | `validateAsync` |

`*Sync` throws `SealError` if the DTO is async on that direction (e.g. async transform on deserialize side for `deserializeSync`). `*Async` always returns `Promise` (sync DTOs are wrapped via `Promise.resolve`). The integrated `deserialize` / `serialize` / `validate` remain available for ergonomic use.

## Defect fixes (no migration needed)

The following bugs in 2.x are silently fixed in 3.x:

- **Set/Map nested DTO cycles** no longer cause stack overflow (`circular-analyzer` now walks `collectionValue`).
- **Set/Map value DTOs marked async** now correctly propagate `_isAsync` / `_isSerializeAsync` to the parent.
- **Discriminator with empty `subTypes`** throws `SealError` at seal time instead of producing invalid generated JS.
- **Concurrent async deserialize on the same input** no longer reports a false `circular` error (per-call `WeakSet` via `Symbol.for('baker:circular-seen')`).
- **`Object.hasOwn` checks** prevent prototype-chain values from leaking into DTO results.
- **Discriminator default branch** error now reports `context: { received, validSubTypes: [...] }`.
- **FR passport regex** now anchors both ends.
- **MAGNET URI regex** now anchors the trailing end.
- **Inheritance dedup** now compares by `ruleName` — a child re-declaring the same rule replaces the parent's rule.
- **`seal(Class)` failure** is now transactional: a failed seal removes the placeholder so retry can succeed.
- **`collectionValue` thunk** errors are wrapped in `SealError` with the field name.

## Removed APIs

- `_runSealed` (was internal, but some test code depended on it). Use the public functions instead.

## Notes

- The decorator-side registry (`globalRegistry`) is still used internally as an index of decorated classes so `seal()` (no args) can seal everything. This is not auto-seal — `seal()` must be called explicitly.
- `unseal()` is exported by `test/integration/helpers/unseal.ts` for testing only. It is not part of the public API.
