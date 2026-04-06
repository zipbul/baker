import { isErr } from '@zipbul/result';
import { _toBakerErrors, type BakerError, type BakerErrors } from '../errors';
import { _ensureSealed } from '../seal/seal';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts input to a Class instance + validates.
 * - Auto-seals on first call (batches entire globalRegistry)
 * - Sync DTOs return directly; async DTOs return Promise
 * - Success: T
 * - Validation failure: BakerErrors (use isBakerError() to narrow)
 * - Class without decorators: throws SealError
 */
export function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerErrors;
export function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T | BakerErrors>;
export function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerErrors | Promise<T | BakerErrors> {
  const sealed = _ensureSealed(Class);

  if (sealed._isAsync) {
    return (sealed._deserialize(input, options) as Promise<any>).then((result): T | BakerErrors => {
      if (isErr(result)) return _toBakerErrors(result.data as BakerError[]);
      return result as T;
    });
  }

  const result = sealed._deserialize(input, options);
  if (isErr(result)) return _toBakerErrors(result.data as BakerError[]);
  return result as T;
}
