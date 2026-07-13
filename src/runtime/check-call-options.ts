import type { RuntimeOptions } from '../common';

import { BakerError } from '../common';
import { CALL_OPTION_KEYS, SEAL_TIME_KEYS } from './constants';

/**
 * @internal — validate per-call options object at public-API entry.
 * `groups` is the only valid per-call key; everything else is rejected:
 *   - seal-time keys (BakerConfig / SealOptions) → "move to new Baker({...})"
 *   - any other key → "unknown call option"
 */
export function checkCallOptions(opts: unknown): RuntimeOptions | undefined {
  if (opts === undefined || opts === null) {
    return undefined;
  }
  if (typeof opts !== 'object' || Array.isArray(opts)) {
    throw new BakerError(`Call options must be a plain object. Received: ${Array.isArray(opts) ? 'array' : typeof opts}.`);
  }
  // Strict same-realm plain-object check.
  // Accept: `{}` (proto === Object.prototype) and `Object.create(null)` (proto === null).
  // Reject: every other prototype, including class instances whose `constructor.name` is
  // renamed to 'Object' (trojan), built-ins (Date/Map/Set), cross-realm objects.
  // Cross-realm consumers can normalize with `Object.assign({}, opts)` before calling.
  const proto = Object.getPrototypeOf(opts);
  if (proto !== null && proto !== Object.prototype) {
    const ctorName = (opts as { constructor?: { name?: string } }).constructor?.name ?? 'unknown';
    throw new BakerError(`Call options must be a plain object literal. Received instance of ${ctorName}.`);
  }
  // `for...in` replaces `Object.keys(opts)` to avoid allocating a keys array on the hot path.
  // `proto` above is `null` or `Object.prototype`, but `for...in` also walks inherited ENUMERABLE
  // properties — and while `Object.prototype`'s built-ins are non-enumerable, user/library code may
  // have added enumerable ones (prototype pollution). The `Object.hasOwn` guard filters those out,
  // restoring exact `Object.keys` membership and order (own enumerable string keys) allocation-free.
  for (const key in opts) {
    if (!Object.hasOwn(opts, key)) {
      continue;
    }
    if (key === 'groups') {
      const groups = (opts as RuntimeOptions).groups;
      if (groups !== undefined) {
        const isArray = Array.isArray(groups);
        let hasNonString = false;
        if (isArray) {
          // `i in groups` skips holes — matches `Array.prototype.some`'s HasProperty check, so a
          // sparse array (e.g. `new Array(1)`) is treated the same as before this loop replaced `some`.
          for (let i = 0; i < groups.length; i++) {
            if (i in groups && typeof groups[i] !== 'string') {
              hasNonString = true;
              break;
            }
          }
        }
        if (!isArray || hasNonString) {
          const received = isArray ? 'an array with a non-string element' : typeof groups;
          throw new BakerError(`Call option 'groups' must be a string[] of group names. Received: ${received}.`);
        }
      }
      continue;
    }
    if (SEAL_TIME_KEYS.has(key)) {
      throw new BakerError(
        `Option '${key}' is a seal-time setting and cannot be passed per-call. ` +
          `Move it to new Baker({ ${key}: ... }) at app startup. ` +
          `Per-call options: ${[...CALL_OPTION_KEYS].join(', ')}.`,
      );
    }
    throw new BakerError(
      `Unknown per-call option '${key}'. Valid per-call options: ${[...CALL_OPTION_KEYS].join(', ')}. ` +
        `Seal-time options go to new Baker({...}).`,
    );
  }
  return opts as RuntimeOptions;
}
