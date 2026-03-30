import { _runSealed } from './_run-sealed';
import type { BakerErrors } from '../errors';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// deserialize — Public API (§5.1)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts input to a Class instance + validates.
 * - Auto-seals on first call (batches entire globalRegistry)
 * - Sync DTOs return directly, async DTOs return Promise
 * - Success: T
 * - Validation failure: BakerErrors (use isBakerError() to narrow)
 * - Class without decorators: throws SealError
 */
export function deserialize<T>(
  Class: new (...args: any[]) => T,
  input: unknown,
  options?: RuntimeOptions,
): T | BakerErrors | Promise<T | BakerErrors> {
  return _runSealed(Class, input, options, (result) => result as T);
}
