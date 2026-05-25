import type { BakerIssue, BakerIssueSet } from '../errors';
import type { RuntimeOptions } from '../interfaces';

import { toBakerIssueSet, BakerError } from '../errors';
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
): true | BakerIssueSet | Promise<true | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerIssue[] | null>).then((result): true | BakerIssueSet =>
      result === null ? true : toBakerIssueSet(result),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerIssue[] | null;
  return result === null ? true : toBakerIssueSet(result);
}

// ─────────────────────────────────────────────────────────────────────────────
// W14: strict sync/async variants — explicit intent at call site
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sync-asserted validate. Throws `BakerError` if Class has any async rule/transform
 * on the deserialize/validate side. Use when caller code assumes sync return.
 */
function validateSync<T>(Class: new (...args: never[]) => T, input: unknown, options?: RuntimeOptions): true | BakerIssueSet {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    throw new BakerError(`validateSync(${Class.name}): DTO has async rules/transforms. Use validateAsync() instead.`);
  }
  const result = sealed.validate(input, checkedOpts) as BakerIssue[] | null;
  return result === null ? true : toBakerIssueSet(result);
}

/**
 * Async-asserted validate. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
function validateAsync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<true | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerIssue[] | null>).then((r): true | BakerIssueSet =>
      r === null ? true : toBakerIssueSet(r),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerIssue[] | null;
  return Promise.resolve(result === null ? true : toBakerIssueSet(result));
}
export { validate, validateSync, validateAsync };
