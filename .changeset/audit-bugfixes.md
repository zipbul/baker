---
"@zipbul/baker": patch
---

Fix four bugs found in a package-wide line-by-line audit:

- **`@IsEnum` with numeric enums** no longer accepts the enum member *names* as valid values. TypeScript
  numeric enums compile to a reverse-mapped object (`{ 0: 'Inactive', 1: 'Active', Active: 1, Inactive: 0 }`),
  so the previous `Object.values()` lookup wrongly accepted the key-name strings (e.g. `'Active'`). Values
  are now read through the non-numeric keys, which is correct for string, numeric, and heterogeneous enums.
- **`luxonTransformer`** now passes an unparseable date string / `Date` through untouched instead of
  laundering it into an Invalid `DateTime` (which serialized to `null` / `"Invalid DateTime"` and corrupted
  data). This matches `momentTransformer`'s existing pass-through contract.
- **`momentTransformer`** now parses input in UTC (`moment.utc`) so a zoneless datetime string resolves to
  the same instant on every host; previously local-time parsing made serialized output depend on the
  machine timezone. Matches `luxonTransformer`'s UTC default.
- **Per-call `groups` option** is now validated at the call boundary: a non-`string[]` value throws a clear
  `BakerError` instead of silently misbehaving inside the generated executor.
