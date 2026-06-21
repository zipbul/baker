---
"@zipbul/baker": minor
---

Fix five reproduced correctness bugs (each added as a RED test first) and unify the unknown-key failure
model. Several change observable behavior — review before upgrading:

- **Discriminated arrays now work (was broken).** A field typed `type: () => [Base]` with a `discriminator`
  previously read the discriminator off the *array itself* (`undefined`) and rejected every valid input with
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
