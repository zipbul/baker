import { isErr } from '@zipbul/result';

import type { RuntimeOptions, BakerIssue, BakerIssueSet } from '../common';
import type { SealedExecutors } from '../seal';

import { toBakerIssueSet, BakerError } from '../common';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// run* helpers — post-resolution dispatch, shared by the global functions and Baker methods
// ─────────────────────────────────────────────────────────────────────────────

function runDeserialize<T>(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerIssueSet | Promise<T | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return (sealed.deserialize(input, checkedOpts) as Promise<unknown>).then((result): T | BakerIssueSet => {
      if (isErr(result)) {
        return toBakerIssueSet(result.data as BakerIssue[]);
      }
      return result as T;
    });
  }
  const result = sealed.deserialize(input, checkedOpts);
  if (isErr(result)) {
    return toBakerIssueSet(result.data as BakerIssue[]);
  }
  return result as T;
}

function runDeserializeSync<T>(
  sealed: SealedExecutors<unknown>,
  className: string,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerIssueSet {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    throw new BakerError(`deserializeSync(${className}): DTO has async rules/transforms. Use deserializeAsync() instead.`);
  }
  const result = sealed.deserialize(input, checkedOpts);
  if (isErr(result)) {
    return toBakerIssueSet(result.data as BakerIssue[]);
  }
  return result as T;
}

function runDeserializeAsync<T>(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return (sealed.deserialize(input, checkedOpts) as Promise<unknown>).then((result): T | BakerIssueSet => {
      if (isErr(result)) {
        return toBakerIssueSet(result.data as BakerIssue[]);
      }
      return result as T;
    });
  }
  const result = sealed.deserialize(input, checkedOpts);
  if (isErr(result)) {
    return Promise.resolve(toBakerIssueSet(result.data as BakerIssue[]));
  }
  return Promise.resolve(result as T);
}

export { runDeserialize, runDeserializeSync, runDeserializeAsync };
