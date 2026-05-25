---
"@zipbul/baker": major
---

3.0 — error system redesign and API hardening (breaking).

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

See `MIGRATION-3.0.md` for the full upgrade guide.
