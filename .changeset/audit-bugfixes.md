---
"@zipbul/baker": minor
---

Fix four correctness bugs found in a package-wide audit. Two of them change observable behavior for
input that previously "worked", so review before upgrading:

- **`@IsEnum` with numeric enums (behavior change).** TypeScript numeric enums compile to a reverse-mapped
  object (`{ 0: 'Inactive', 1: 'Active', Active: 1, Inactive: 0 }`), so the previous `Object.values()`
  lookup wrongly accepted the member-*name* strings (e.g. `'Active'`) as valid values. Values are now read
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
