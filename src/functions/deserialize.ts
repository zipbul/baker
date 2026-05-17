import { isErr } from '@zipbul/result';

import type { RuntimeOptions } from '../interfaces';

import { toBakerErrors, SealError, type BakerError, type BakerErrors } from '../errors';
import { ensureSealed } from '../seal/seal';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts input to a Class instance + validates.
 * - Requires `seal()` to be called beforehand; throws `SealError` if not sealed
 * - Sync DTOs return directly; async DTOs return Promise
 * - Success: T
 * - Validation failure: BakerErrors (use isBakerError() to narrow)
 */
export function deserialize<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerErrors | Promise<T | BakerErrors>;
export function deserialize<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerErrors | Promise<T | BakerErrors> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);

  if (sealed.isAsync) {
    return (sealed.deserialize(input, checkedOpts) as Promise<unknown>).then((result): T | BakerErrors => {
      if (isErr(result)) {
        return toBakerErrors(result.data as BakerError[]);
      }
      return result as T;
    });
  }

  const result = sealed.deserialize(input, checkedOpts);
  if (isErr(result)) {
    return toBakerErrors(result.data as BakerError[]);
  }
  return result as T;
}

/**
 * Sync-asserted deserialize. Throws `SealError` if Class has any async rule/transform
 * on the deserialize side.
 */
export function deserializeSync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerErrors {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    throw new SealError(`deserializeSync(${Class.name}): DTO has async rules/transforms. Use deserializeAsync() instead.`);
  }
  const result = sealed.deserialize(input, checkedOpts);
  if (isErr(result)) {
    return toBakerErrors(result.data as BakerError[]);
  }
  return result as T;
}

/**
 * Async-asserted deserialize. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
export function deserializeAsync<T>(
  Class: new (...args: never[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T | BakerErrors> {
  const checkedOpts = checkCallOptions(options);
  const sealed = ensureSealed(Class);
  if (sealed.isAsync) {
    return (sealed.deserialize(input, checkedOpts) as Promise<unknown>).then((result): T | BakerErrors => {
      if (isErr(result)) {
        return toBakerErrors(result.data as BakerError[]);
      }
      return result as T;
    });
  }
  const result = sealed.deserialize(input, checkedOpts);
  if (isErr(result)) {
    return Promise.resolve(toBakerErrors(result.data as BakerError[]));
  }
  return Promise.resolve(result as T);
}
