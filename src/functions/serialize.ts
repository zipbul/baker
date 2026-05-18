import type { RuntimeOptions } from '../interfaces';
import type { SealedExecutors } from '../types';

import { SealError } from '../errors';
import { ensureSealed } from '../seal/seal';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/** Boundary check shared by serialize / serializeSync / serializeAsync. */
function resolveSerializer(instance: unknown, fnName: string): SealedExecutors<unknown> {
  if (instance == null || typeof instance !== 'object') {
    throw new SealError(`${fnName}: expected a class instance, got ${instance === null ? 'null' : typeof instance}`);
  }
  const Class = (instance as { constructor: Function }).constructor as Function | undefined;
  if (typeof Class !== 'function') {
    throw new SealError(`${fnName}: instance has no constructor`);
  }
  if (Class === Object) {
    throw new SealError(`${fnName}: received a plain object. Pass an instance of a DTO class decorated with @Field.`);
  }
  return ensureSealed(Class);
}

/**
 * Converts a Class instance to a plain object.
 * - Requires `seal()` to be called beforehand; throws `SealError` if not sealed
 * - Sync DTOs return directly; async DTOs return Promise
 * - No validation — always returns Record<string, unknown>
 */
export function serialize<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
export function serialize<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  const sealed = resolveSerializer(instance, 'serialize');
  return sealed.isSerializeAsync
    ? (sealed.serialize(instance, checkedOpts) as Promise<Record<string, unknown>>)
    : (sealed.serialize(instance, checkedOpts) as Record<string, unknown>);
}

/**
 * Sync-asserted serialize. Throws `SealError` if Class has any async transform on the serialize side.
 */
export function serializeSync<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> {
  const checkedOpts = checkCallOptions(options);
  const sealed = resolveSerializer(instance, 'serializeSync');
  if (sealed.isSerializeAsync) {
    const className = ((instance as { constructor: Function }).constructor as Function).name;
    throw new SealError(`serializeSync(${className}): DTO has async serialize transforms. Use serializeAsync() instead.`);
  }
  return sealed.serialize(instance, checkedOpts) as Record<string, unknown>;
}

/**
 * Async-asserted serialize. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
export function serializeAsync<T>(instance: T, options?: RuntimeOptions): Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  const sealed = resolveSerializer(instance, 'serializeAsync');
  return sealed.isSerializeAsync
    ? (sealed.serialize(instance, checkedOpts) as Promise<Record<string, unknown>>)
    : Promise.resolve(sealed.serialize(instance, checkedOpts) as Record<string, unknown>);
}
