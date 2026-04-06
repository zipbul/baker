import { _ensureSealed } from '../seal/seal';
import { SealError } from '../errors';
import type { RuntimeOptions } from '../interfaces';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a Class instance to a plain object.
 * - Auto-seals on first call (batches entire globalRegistry)
 * - Sync DTOs return directly; async DTOs return Promise
 * - No validation — always returns Record<string, unknown>
 * - Class without decorators: throws SealError
 */
export function serialize<T>(
  instance: T,
  options?: RuntimeOptions,
): Record<string, unknown>;
export function serialize<T>(
  instance: T,
  options?: RuntimeOptions,
): Promise<Record<string, unknown>>;
export function serialize<T>(
  instance: T,
  options?: RuntimeOptions,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  if (instance == null || typeof instance !== 'object') {
    throw new SealError('serialize: expected a class instance, got ' + (instance === null ? 'null' : typeof instance));
  }
  const Class = (instance as any).constructor as Function | undefined;
  if (typeof Class !== 'function') {
    throw new SealError('serialize: instance has no constructor');
  }
  const sealed = _ensureSealed(Class);
  if (sealed._isSerializeAsync) {
    return sealed._serialize(instance, options) as Promise<Record<string, unknown>>;
  }
  return sealed._serialize(instance, options) as Record<string, unknown>;
}
