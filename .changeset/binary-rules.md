---
"@zipbul/baker": minor
---

Add two binary-value validation rules to `@zipbul/baker/rules`:

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
