import type { BakerError, BakerErrors } from '../errors';
import type { RuntimeOptions } from '../interfaces';

import { toBakerErrors, SealError } from '../errors';
import { ensureSealed } from '../seal/seal';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// validate — Public API (§5.3)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * DTO-level validation — validates `input` against a decorated class's schema.
 * Sync DTOs return directly; async DTOs return Promise. To validate a single primitive without a
 * DTO, call the rule directly (e.g. `isEmail()(value)`).
 */
function validate<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerErrors | Promise<true | BakerErrors> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerError[] | null>).then((result): true | BakerErrors =>
      result === null ? true : toBakerErrors(result),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerError[] | null;
  return result === null ? true : toBakerErrors(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// W14: strict sync/async variants — explicit intent at call site
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync-asserted validate. Throws `SealError` if Class has any async rule/transform
 * on the deserialize/validate side. Use when caller code assumes sync return.
 */
function validateSync<T>(Class: new (...args: never[]) => T, input: unknown, options?: RuntimeOptions): true | BakerErrors {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    throw new SealError(`validateSync(${Class.name}): DTO has async rules/transforms. Use validateAsync() instead.`);
  }
  const result = sealed.validate(input, checkedOpts) as BakerError[] | null;
  return result === null ? true : toBakerErrors(result);
}

/**
 * Async-asserted validate. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
function validateAsync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<true | BakerErrors> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerError[] | null>).then((r): true | BakerErrors =>
      r === null ? true : toBakerErrors(r),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerError[] | null;
  return Promise.resolve(result === null ? true : toBakerErrors(result));
}
export { validate, validateSync, validateAsync };
