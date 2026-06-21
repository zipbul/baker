import type { RuntimeOptions } from '../common';

import { BakerError } from '../common';
import { BAKER_CONFIG_KEYS } from '../config';

const CALL_OPTION_KEYS = new Set<string>(['groups']);
// Seal-time keys rejected per-call: the public BakerConfig names (single source: BAKER_CONFIG_KEYS)
// plus the internal SealOptions aliases they normalize to.
const SEAL_TIME_KEYS = new Set<string>([
  ...BAKER_CONFIG_KEYS,
  'enableImplicitConversion',
  'exposeDefaultValues',
  'whitelist',
]);

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
  for (const key of Object.keys(opts)) {
    if (CALL_OPTION_KEYS.has(key)) {
      if (key === 'groups') {
        const groups = (opts as RuntimeOptions).groups;
        if (groups !== undefined && (!Array.isArray(groups) || groups.some(g => typeof g !== 'string'))) {
          const received = Array.isArray(groups) ? 'an array with a non-string element' : typeof groups;
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
