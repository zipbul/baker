import { isErr } from '@zipbul/result';
import { BakerValidationError } from '../errors';
import { _ensureSealed } from '../seal/seal';
import type { BakerError } from '../errors';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (throw pattern) (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

function unwrapResult<T>(result: any, className: string): T {
  if (isErr(result)) {
    throw new BakerValidationError(result.data as BakerError[], className);
  }
  return result as T;
}

/**
 * Converts input to a Class instance + validates.
 * - Auto-seals on first call (batches entire globalRegistry)
 * - DTOs without async transform/rules run without `async function`, returned via Promise.resolve
 * - Success: returns Promise<T>
 * - Validation failure: BakerValidationError (rejected promise)
 * - Class without decorators: throws SealError
 */
export function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): Promise<T> {
  try {
    const sealed = _ensureSealed(Class);
    if (sealed._isAsync) {
      return (sealed._deserialize(input, options) as Promise<any>).then(
        (result: any) => unwrapResult<T>(result, Class.name),
      );
    }
    return Promise.resolve(unwrapResult<T>(sealed._deserialize(input, options), Class.name));
  } catch (e) {
    return Promise.reject(e);
  }
}
