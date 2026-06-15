import type { BakerIssue, BakerIssueSet } from '../errors';
import type { RuntimeOptions } from '../interfaces';
import type { SealedExecutors } from '../types';

import { toBakerIssueSet, BakerError } from '../errors';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// run* helpers — post-resolution dispatch, shared by the global functions and Baker methods
// ─────────────────────────────────────────────────────────────────────────────

function runValidate(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): true | BakerIssueSet | Promise<true | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerIssue[] | null>).then((result): true | BakerIssueSet =>
      result === null ? true : toBakerIssueSet(result),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerIssue[] | null;
  return result === null ? true : toBakerIssueSet(result);
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
  const result = sealed.validate(input, checkedOpts) as BakerIssue[] | null;
  return result === null ? true : toBakerIssueSet(result);
}

function runValidateAsync(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): Promise<true | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return (sealed.validate(input, checkedOpts) as Promise<BakerIssue[] | null>).then((r): true | BakerIssueSet =>
      r === null ? true : toBakerIssueSet(r),
    );
  }
  const result = sealed.validate(input, checkedOpts) as BakerIssue[] | null;
  return Promise.resolve(result === null ? true : toBakerIssueSet(result));
}

export { runValidate, runValidateSync, runValidateAsync };
