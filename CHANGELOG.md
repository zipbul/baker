# @zipbul/baker

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
