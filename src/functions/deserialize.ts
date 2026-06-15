import { isErr } from '@zipbul/result';

import type { RuntimeOptions } from '../interfaces';
import type { SealedExecutors } from '../types';

import { toBakerIssueSet, BakerError, type BakerIssue, type BakerIssueSet } from '../errors';
import { ensureSealed } from '../seal/seal';
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

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts input to a Class instance + validates.
 * - Requires the class's baker to be sealed (`new Baker().seal()`) beforehand; throws `BakerError` if not sealed
 * - Sync DTOs return directly; async DTOs return Promise
 * - Success: T
 * - Validation failure: BakerIssueSet (use isBakerIssueSet() to narrow)
 */
export function deserialize<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerIssueSet | Promise<T | BakerIssueSet>;
export function deserialize<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerIssueSet | Promise<T | BakerIssueSet> {
  return runDeserialize<T>(ensureSealed(Class), input, options);
}

/**
 * Sync-asserted deserialize. Throws `BakerError` if Class has any async rule/transform
 * on the deserialize side.
 */
export function deserializeSync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerIssueSet {
  return runDeserializeSync<T>(ensureSealed(Class), Class.name, input, options);
}

/**
 * Async-asserted deserialize. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
export function deserializeAsync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T | BakerIssueSet> {
  return runDeserializeAsync<T>(ensureSealed(Class), input, options);
}

export { runDeserialize, runDeserializeSync, runDeserializeAsync };
