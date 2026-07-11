import type { BakerIssue, BakerIssueSet, RuntimeOptions } from '../common';
import type { SealedExecutors } from '../seal';

import { BakerError } from '../common';
import { toBakerIssueSet } from '../common/errors';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// run* helpers — post-resolution dispatch, shared by the Baker validate methods
// ─────────────────────────────────────────────────────────────────────────────

/** Map a validate result (`BakerIssue[] | null`) to the public `true | BakerIssueSet` shape. */
function unwrapValidate(result: BakerIssue[] | null): true | BakerIssueSet {
  return result === null ? true : toBakerIssueSet(result);
}

function runValidate(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerIssueSet | Promise<true | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return Promise.resolve(sealed.validate(input, checkedOpts)).then(unwrapValidate);
  }
  // Sync branch: `isAsync` false guarantees the sync arm; the cast only drops the unreachable Promise arm.
  return unwrapValidate(sealed.validate(input, checkedOpts) as BakerIssue[] | null);
}

function runValidateSync(
  sealed: SealedExecutors<unknown>,
  className: string,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerIssueSet {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    throw new BakerError(`validateSync(${className}): DTO has async rules/transforms. Use validateAsync() instead.`);
  }
  return unwrapValidate(sealed.validate(input, checkedOpts) as BakerIssue[] | null);
}

function runValidateAsync(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): Promise<true | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return Promise.resolve(sealed.validate(input, checkedOpts)).then(unwrapValidate);
  }
  return Promise.resolve(unwrapValidate(sealed.validate(input, checkedOpts) as BakerIssue[] | null));
}

export { runValidate, runValidateSync, runValidateAsync };
