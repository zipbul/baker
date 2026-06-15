import type { RuntimeOptions } from '../interfaces';
import type { SealedExecutors } from '../types';

import { BakerError } from '../errors';
import { ensureSealed } from '../seal/seal';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forgery check shared by serialize / serializeSync / serializeAsync. Returns the validated
 * constructor; resolution to a sealed executor is done by the caller (global slot or baker map).
 */
function resolveSerializeClass(instance: unknown, fnName: string): Function {
  if (instance == null || typeof instance !== 'object') {
    throw new BakerError(`${fnName}: expected a class instance, got ${instance === null ? 'null' : typeof instance}`);
  }
  const Class = (instance as { constructor: Function }).constructor as Function | undefined;
  if (typeof Class !== 'function') {
    throw new BakerError(`${fnName}: instance has no constructor`);
  }
  // Reject plain objects and forged ones (e.g. `{ constructor: SomeDto }`): a real instance is
  // `instanceof` its own constructor via the prototype chain; the `constructor` property alone
  // (which anyone can set) is not trusted.
  if (Class === Object || !(instance instanceof Class)) {
    throw new BakerError(`${fnName}: received a plain object. Pass an instance of a DTO class decorated with @Field.`);
  }
  return Class;
}

/** Boundary check shared by the global serialize functions — forgery check + global resolution. */
function resolveSerializer(instance: unknown, fnName: string): SealedExecutors<unknown> {
  return ensureSealed(resolveSerializeClass(instance, fnName));
}

// ─────────────────────────────────────────────────────────────────────────────
// run* helpers — post-resolution dispatch, shared by the global functions and Baker methods
// ─────────────────────────────────────────────────────────────────────────────

function runSerialize<T>(
  sealed: SealedExecutors<unknown>,
  instance: T,
  options?: RuntimeOptions,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  return sealed.isSerializeAsync
    ? (sealed.serialize(instance, checkedOpts) as Promise<Record<string, unknown>>)
    : (sealed.serialize(instance, checkedOpts) as Record<string, unknown>);
}

function runSerializeSync<T>(
  sealed: SealedExecutors<unknown>,
  className: string,
  instance: T,
  options?: RuntimeOptions,
): Record<string, unknown> {
  const checkedOpts = checkCallOptions(options);
  if (sealed.isSerializeAsync) {
    throw new BakerError(`serializeSync(${className}): DTO has async serialize transforms. Use serializeAsync() instead.`);
  }
  return sealed.serialize(instance, checkedOpts) as Record<string, unknown>;
}

function runSerializeAsync<T>(
  sealed: SealedExecutors<unknown>,
  instance: T,
  options?: RuntimeOptions,
): Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  return sealed.isSerializeAsync
    ? (sealed.serialize(instance, checkedOpts) as Promise<Record<string, unknown>>)
    : Promise.resolve(sealed.serialize(instance, checkedOpts) as Record<string, unknown>);
}

/**
 * Converts a Class instance to a plain object.
 * - Requires the class's baker to be sealed (`new Baker().seal()`) beforehand; throws `BakerError` if not sealed
 * - Sync DTOs return directly; async DTOs return Promise
 * - No validation — always returns Record<string, unknown>
 */
export function serialize<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>>;
export function serialize<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> | Promise<Record<string, unknown>> {
  return runSerialize(resolveSerializer(instance, 'serialize'), instance, options);
}

/**
 * Sync-asserted serialize. Throws `BakerError` if Class has any async transform on the serialize side.
 */
export function serializeSync<T>(instance: T, options?: RuntimeOptions): Record<string, unknown> {
  const Class = resolveSerializeClass(instance, 'serializeSync');
  return runSerializeSync(ensureSealed(Class), Class.name, instance, options);
}

/**
 * Async-asserted serialize. Always returns Promise (sync DTOs are wrapped via Promise.resolve).
 */
export function serializeAsync<T>(instance: T, options?: RuntimeOptions): Promise<Record<string, unknown>> {
  return runSerializeAsync(resolveSerializer(instance, 'serializeAsync'), instance, options);
}

export { resolveSerializeClass, runSerialize, runSerializeSync, runSerializeAsync };
