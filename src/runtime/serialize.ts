import type { RuntimeOptions } from '../common/interfaces';
import type { SealedExecutors } from '../seal/types';

import { BakerError } from '../common/errors';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// serialize — Public API (§5.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forgery check shared by the Baker serialize methods. Returns the validated constructor; resolution
 * to a sealed executor is done by the caller from its baker map.
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

export { resolveSerializeClass, runSerialize, runSerializeSync, runSerializeAsync };
