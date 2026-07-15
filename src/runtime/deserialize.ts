import type { RuntimeOptions, BakerIssueSet } from '../common';
import type { SealedExecutors } from '../seal';

import { BakerError } from '../common';
import { toBakerIssueSet } from '../common/errors';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// run* helpers — post-resolution dispatch, shared by the Baker deserialize methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map a deserialize outcome to the public `T | BakerIssueSet` shape. Success is always a class
 * instance (never a raw array), so `Array.isArray()` discriminates the `BakerIssue[]` failure array
 * soundly; the `unknown → T` assertion on the success arm is unavoidable — the sealed executor is
 * generically typed `SealedExecutors<unknown>` at this boundary.
 */
function unwrapDeserialize<T>(result: unknown): T | BakerIssueSet {
  return Array.isArray(result) ? toBakerIssueSet(result) : (result as T);
}

function runDeserialize<T>(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerIssueSet | Promise<T | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return Promise.resolve(sealed.deserialize(input, checkedOpts)).then(r => unwrapDeserialize<T>(r));
  }
  return unwrapDeserialize<T>(sealed.deserialize(input, checkedOpts));
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
  return unwrapDeserialize<T>(sealed.deserialize(input, checkedOpts));
}

function runDeserializeAsync<T>(
  sealed: SealedExecutors<unknown>,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T | BakerIssueSet> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isAsync) {
    return Promise.resolve(sealed.deserialize(input, checkedOpts)).then(r => unwrapDeserialize<T>(r));
  }
  return Promise.resolve(unwrapDeserialize<T>(sealed.deserialize(input, checkedOpts)));
}

export { runDeserialize, runDeserializeSync, runDeserializeAsync };
