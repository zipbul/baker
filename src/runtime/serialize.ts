import type { RuntimeOptions } from '../common';
import type { SealedExecutors } from '../seal';

import { BakerError } from '../common';
import { checkCallOptions } from './check-call-options';

// ─────────────────────────────────────────────────────────────────────────────
// resolveSerializeClass — derive the (forgery-checked) constructor from an instance
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
// run* helpers — post-resolution dispatch, shared by the Baker serialize methods
// ─────────────────────────────────────────────────────────────────────────────

function runSerialize<T>(
  sealed: SealedExecutors<unknown>,
  instance: T,
  options?: RuntimeOptions,
): Record<string, unknown> | Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  // `sealed.serialize` already returns the sync|async union — return it as-is, no cast.
  return sealed.serialize(instance, checkedOpts);
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
  // Sync branch: `isSerializeAsync` false guarantees the sync arm; the cast only drops the Promise arm.
  return sealed.serialize(instance, checkedOpts) as Record<string, unknown>;
}

function runSerializeAsync<T>(
  sealed: SealedExecutors<unknown>,
  instance: T,
  options?: RuntimeOptions,
): Promise<Record<string, unknown>> {
  const checkedOpts = checkCallOptions(options);
  // `Promise.resolve` unifies both arms of the sync|async union — no cast needed.
  return Promise.resolve(sealed.serialize(instance, checkedOpts));
}

export { resolveSerializeClass, runSerialize, runSerializeSync, runSerializeAsync };
