import type { RuntimeOptions } from '../interfaces';

import { SealError } from '../errors';
import { ensureSealed } from '../seal/seal';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts a Class instance to a plain object.
 * - Requires `seal()` to be called beforehand; throws `SealError` if not sealed
 * - Sync DTOs return directly; async DTOs return Promise
 * - No validation — always returns Record<string, unknown>
 */
export function serialize<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
export function serialize<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  if (instance == null || typeof instance !== 'object') {
    throw new SealError('serialize: expected a class instance, got ' + (instance === null ? 'null' : typeof instance));
  }
  const Class = (instance as any).constructor as Function | undefined;
  if (typeof Class !== 'function') {
    throw new SealError('serialize: instance has no constructor');
  }
  if (Class === Object) {
    throw new SealError('serialize: received a plain object. Pass an instance of a DTO class decorated with @Field.');
  }
  const sealed = ensureSealed(Class);
  if (sealed.isSerializeAsync) {
    return sealed.serialize(instance, checkedOpts) as Promise<Record<string, unknown>>;
  }
  return sealed.serialize(instance, checkedOpts) as Record<string, unknown>;
}

/**
 * Sync-asserted serialize. Throws `SealError` if Class has any async transform on the serialize side.
 */
export function serializeSync<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> {
  const checkedOpts = checkCallOptions(options);
  if (instance == null || typeof instance !== 'object') {
    throw new SealError('serializeSync: expected a class instance, got ' + (instance === null ? 'null' : typeof instance));
  }
  const Class = (instance as any).constructor as Function | undefined;
  if (typeof Class !== 'function') {
    throw new SealError('serializeSync: instance has no constructor');
  }
  if (Class === Object) {
    throw new SealError('serializeSync: received a plain object. Pass an instance of a DTO class decorated with @Field.');
  }
  const sealed = ensureSealed(Class);
  if (sealed.isSerializeAsync) {
    throw new SealError(
      `serializeSync(${(Class as Function).name}): DTO has async serialize transforms. Use serializeAsync() instead.`,
    );
  }
  return sealed.serialize(instance, checkedOpts) as Record<string, unknown>;
}

/**
 * Async-asserted serialize. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
export function serializeAsync<T>(instance: T, options?: RuntimeOptions): Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  if (instance == null || typeof instance !== 'object') {
    throw new SealError('serializeAsync: expected a class instance, got ' + (instance === null ? 'null' : typeof instance));
  }
  const Class = (instance as any).constructor as Function | undefined;
  if (typeof Class !== 'function') {
    throw new SealError('serializeAsync: instance has no constructor');
  }
  if (Class === Object) {
    throw new SealError('serializeAsync: received a plain object. Pass an instance of a DTO class decorated with @Field.');
  }
  const sealed = ensureSealed(Class);
  if (sealed.isSerializeAsync) {
    return sealed.serialize(instance, checkedOpts) as Promise<Record<string, unknown>>;
  }
  return Promise.resolve(sealed.serialize(instance, checkedOpts) as Record<string, unknown>);
}
